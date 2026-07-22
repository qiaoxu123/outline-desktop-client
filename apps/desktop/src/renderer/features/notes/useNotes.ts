import { useCallback, useEffect, useRef, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { useUserInfo } from "../../hooks/useOutline";
import {
  type Note,
  type NoteLink,
  type NotesFile,
  NOTES_VERSION,
  notesFilePath,
  cacheKey,
} from "./types";
import {
  mergeNotes,
  parseTags,
  purgeExpired,
  makeId,
  toMarkdownExport,
} from "./noteUtils";

function readCache(userId: string): Note[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    return (JSON.parse(raw) as NotesFile).notes ?? [];
  } catch {
    return [];
  }
}

function writeCache(userId: string, notes: Note[]): void {
  localStorage.setItem(
    cacheKey(userId),
    JSON.stringify({ version: NOTES_VERSION, notes }),
  );
}

export interface UseNotes {
  notes: Note[];
  liveNotes: Note[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  add: (content: string, links: NoteLink[]) => Promise<void>;
  update: (id: string, content: string, links: NoteLink[]) => Promise<void>;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  hardDelete: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkPin: (ids: string[], pinned: boolean) => Promise<void>;
  exportMarkdown: () => string;
  reload: () => void;
}

export function useNotes(): UseNotes {
  const api = useElectronAPI();
  const { user } = useUserInfo();
  const userId = user?.id ?? null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const fetchRemote = useCallback(async (): Promise<Note[]> => {
    if (!userId) return [];
    const res = await unwrapIpc<{ found: boolean; content: string | null }>(
      api.webdav.get(notesFilePath(userId)),
    );
    if (!res.found || !res.content) return [];
    try {
      return (JSON.parse(res.content) as NotesFile).notes ?? [];
    } catch {
      return [];
    }
  }, [api, userId]);

  // 初次加载：cache 秒开 → 远端 → purge → 回写
  useEffect(() => {
    if (!userId) return;
    setNotes(readCache(userId));
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchRemote();
        const purged = purgeExpired(remote, Date.now());
        if (cancelled) return;
        setNotes(purged);
        writeCache(userId, purged);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fetchRemote]);

  // 串行读改写：每次写前 re-GET 远端并按 id 合并，避免覆盖其他设备的新记录
  const commit = useCallback(
    (mutate: (merged: Note[]) => Note[]): Promise<void> => {
      if (!userId) return Promise.resolve();
      const run = async (): Promise<void> => {
        const remote = await fetchRemote();
        const base = mergeNotes(readCache(userId), remote);
        const next = purgeExpired(mutate(base), Date.now());
        await unwrapIpc(
          api.webdav.put(
            notesFilePath(userId),
            JSON.stringify({ version: NOTES_VERSION, notes: next }),
          ),
        );
        setNotes(next);
        writeCache(userId, next);
      };
      const p = chainRef.current.then(run, run);
      chainRef.current = p.catch(() => {});
      return p;
    },
    [api, userId, fetchRemote],
  );

  const nowIso = () => new Date().toISOString();

  const add = useCallback(
    (content: string, links: NoteLink[]) =>
      commit((base) => {
        const t = nowIso();
        const note: Note = {
          id: makeId(Date.now(), Math.random()),
          content,
          tags: parseTags(content),
          createdAt: t,
          updatedAt: t,
          pinned: false,
          deletedAt: null,
          links,
        };
        return [note, ...base];
      }),
    [commit],
  );

  const update = useCallback(
    (id: string, content: string, links: NoteLink[]) =>
      commit((base) =>
        base.map((n) =>
          n.id === id
            ? {
                ...n,
                content,
                tags: parseTags(content),
                links,
                updatedAt: nowIso(),
              }
            : n,
        ),
      ),
    [commit],
  );

  const patch = useCallback(
    (id: string, fields: Partial<Note>) =>
      commit((base) =>
        base.map((n) =>
          n.id === id ? { ...n, ...fields, updatedAt: nowIso() } : n,
        ),
      ),
    [commit],
  );

  const softDelete = useCallback(
    (id: string) => patch(id, { deletedAt: nowIso() }),
    [patch],
  );
  const restore = useCallback(
    (id: string) => patch(id, { deletedAt: null }),
    [patch],
  );
  const hardDelete = useCallback(
    (id: string) => commit((base) => base.filter((n) => n.id !== id)),
    [commit],
  );
  const togglePin = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((n) =>
          n.id === id ? { ...n, pinned: !n.pinned, updatedAt: nowIso() } : n,
        ),
      ),
    [commit],
  );
  const bulkDelete = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      const t = nowIso();
      return commit((base) =>
        base.map((n) =>
          set.has(n.id) ? { ...n, deletedAt: t, updatedAt: t } : n,
        ),
      );
    },
    [commit],
  );
  const bulkPin = useCallback(
    (ids: string[], pinned: boolean) => {
      const set = new Set(ids);
      const t = nowIso();
      return commit((base) =>
        base.map((n) => (set.has(n.id) ? { ...n, pinned, updatedAt: t } : n)),
      );
    },
    [commit],
  );

  const exportMarkdown = useCallback(() => toMarkdownExport(notes), [notes]);
  const reload = useCallback(() => {
    if (!userId) return;
    void fetchRemote().then((r) => {
      const p = purgeExpired(r, Date.now());
      setNotes(p);
      writeCache(userId, p);
    });
  }, [userId, fetchRemote]);

  const liveNotes = notes.filter((n) => !n.deletedAt);
  return {
    notes,
    liveNotes,
    loading,
    error,
    userId,
    add,
    update,
    softDelete,
    restore,
    hardDelete,
    togglePin,
    bulkDelete,
    bulkPin,
    exportMarkdown,
    reload,
  };
}
