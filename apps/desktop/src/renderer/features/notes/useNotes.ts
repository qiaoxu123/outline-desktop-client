import { useCallback } from "react";
import { useWebdavStore } from "../../hooks/useWebdavStore";
import {
  type Note,
  type NoteLink,
  NOTES_VERSION,
  notesFilePath,
  cacheKey,
} from "./types";
import { parseTags, makeId, toMarkdownExport } from "./noteUtils";

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
  const store = useWebdavStore<Note>({
    version: NOTES_VERSION,
    itemsKey: "notes",
    filePath: notesFilePath,
    cacheKey,
  });
  const { items: notes, commit } = store;

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

  const liveNotes = notes.filter((n) => !n.deletedAt);
  return {
    notes,
    liveNotes,
    loading: store.loading,
    error: store.error,
    userId: store.userId,
    add,
    update,
    softDelete,
    restore,
    hardDelete,
    togglePin,
    bulkDelete,
    bulkPin,
    exportMarkdown,
    reload: store.reload,
  };
}
