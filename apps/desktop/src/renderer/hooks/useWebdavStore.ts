import { useCallback, useEffect, useRef, useState } from "react";
import { useElectronAPI } from "./useElectronAPI";
import { unwrapIpc } from "../lib/ipc";
import { useUserInfo } from "./useOutline";

/** Minimum shape every stored item must satisfy for merge/soft-delete. */
export interface StoreItem {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** Union by id; on the same id keep the newer updatedAt. */
export function mergeById<T extends StoreItem>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const n of remote) byId.set(n.id, n);
  for (const n of local) {
    const prev = byId.get(n.id);
    if (!prev || n.updatedAt >= prev.updatedAt) byId.set(n.id, n);
  }
  return [...byId.values()];
}

export function purgeExpired<T extends StoreItem>(items: T[], nowMs: number): T[] {
  return items.filter(
    (n) => !n.deletedAt || nowMs - new Date(n.deletedAt).getTime() < THIRTY_DAYS,
  );
}

export interface WebdavStore<T> {
  items: T[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  /** Serialized read-modify-write: re-GET remote, merge by id, apply, PUT. */
  commit: (mutate: (base: T[]) => T[]) => Promise<void>;
  reload: () => void;
}

/**
 * Generic per-user WebDAV JSON store with a localStorage mirror and
 * multi-device-safe writes. Shared by 随记 and 待办; feature hooks wrap it
 * with their own typed CRUD helpers on top of `commit`.
 */
export function useWebdavStore<T extends StoreItem>(opts: {
  version: number;
  itemsKey: string;
  filePath: (userId: string) => string;
  cacheKey: (userId: string) => string;
}): WebdavStore<T> {
  const { version, itemsKey, filePath, cacheKey } = opts;
  const api = useElectronAPI();
  const { user } = useUserInfo();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const readCache = useCallback(
    (uid: string): T[] => {
      try {
        const raw = localStorage.getItem(cacheKey(uid));
        if (!raw) return [];
        return ((JSON.parse(raw) as Record<string, unknown>)[itemsKey] ??
          []) as T[];
      } catch {
        return [];
      }
    },
    [cacheKey, itemsKey],
  );

  const writeCache = useCallback(
    (uid: string, arr: T[]) => {
      localStorage.setItem(
        cacheKey(uid),
        JSON.stringify({ version, [itemsKey]: arr }),
      );
    },
    [cacheKey, itemsKey, version],
  );

  const fetchRemote = useCallback(async (): Promise<T[]> => {
    if (!userId) return [];
    const res = await unwrapIpc<{ found: boolean; content: string | null }>(
      api.webdav.get(filePath(userId)),
    );
    if (!res.found || !res.content) return [];
    try {
      return ((JSON.parse(res.content) as Record<string, unknown>)[itemsKey] ??
        []) as T[];
    } catch {
      return [];
    }
  }, [api, userId, filePath, itemsKey]);

  useEffect(() => {
    if (!userId) return;
    setItems(readCache(userId));
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchRemote();
        const purged = purgeExpired(remote, Date.now());
        if (cancelled) return;
        setItems(purged);
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
  }, [userId, fetchRemote, readCache, writeCache]);

  const commit = useCallback(
    (mutate: (base: T[]) => T[]): Promise<void> => {
      if (!userId) return Promise.resolve();
      const run = async (): Promise<void> => {
        const remote = await fetchRemote();
        const base = mergeById(readCache(userId), remote);
        const next = purgeExpired(mutate(base), Date.now());
        await unwrapIpc(
          api.webdav.put(
            filePath(userId),
            JSON.stringify({ version, [itemsKey]: next }),
          ),
        );
        setItems(next);
        writeCache(userId, next);
      };
      const p = chainRef.current.then(run, run);
      chainRef.current = p.catch(() => {});
      return p;
    },
    [api, userId, fetchRemote, readCache, writeCache, filePath, version, itemsKey],
  );

  const reload = useCallback(() => {
    if (!userId) return;
    void fetchRemote().then((r) => {
      const p = purgeExpired(r, Date.now());
      setItems(p);
      writeCache(userId, p);
    });
  }, [userId, fetchRemote, writeCache]);

  return { items, loading, error, userId, commit, reload };
}
