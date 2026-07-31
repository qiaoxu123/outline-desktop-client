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
  // 始终反映最新 items 的镜像：乐观更新时同步读写，避免快速连续 commit 读到过期 state。
  const itemsRef = useRef<T[]>([]);
  const applyItems = useCallback((next: T[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

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
    applyItems(readCache(userId));
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchRemote();
        const purged = purgeExpired(remote, Date.now());
        if (cancelled) return;
        applyItems(purged);
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
  }, [userId, fetchRemote, readCache, writeCache, applyItems]);

  const commit = useCallback(
    (mutate: (base: T[]) => T[]): Promise<void> => {
      if (!userId) return Promise.resolve();
      // 1) 乐观更新：立即把变更反映到本地 state + cache。mutate 只调用一次
      //    （add 类会在 mutate 内生成 id/时间戳，重复调用会产生重复条目）。
      const prev = itemsRef.current;
      const optimistic = purgeExpired(mutate(prev), Date.now());
      applyItems(optimistic);
      writeCache(userId, optimistic);
      // 本次 mutate 主动移除的 id（改前有、改后无）。硬删除无墓碑，若不记下，
      // 后台 re-GET 的远端会把它「复活」——合并后按此集合剔除。
      const keptIds = new Set(optimistic.map((n) => n.id));
      const removedIds = new Set(
        prev.filter((n) => !keptIds.has(n.id)).map((n) => n.id),
      );
      // 2) 后台串行化写：re-GET 远端 → 与最新本地合并 → PUT，保证多设备安全，不阻塞 UI。
      const run = async (): Promise<void> => {
        try {
          const remote = await fetchRemote();
          const merged = purgeExpired(
            mergeById(itemsRef.current, remote).filter(
              (n) => !removedIds.has(n.id),
            ),
            Date.now(),
          );
          await unwrapIpc(
            api.webdav.put(
              filePath(userId),
              JSON.stringify({ version, [itemsKey]: merged }),
            ),
          );
          applyItems(merged);
          writeCache(userId, merged);
          setError(null);
        } catch (e) {
          // 变更已乐观写入本地 cache；下次成功 commit 会重新合并上传。
          setError(e);
        }
      };
      const p = chainRef.current.then(run, run);
      chainRef.current = p.catch(() => {});
      return p;
    },
    [api, userId, fetchRemote, writeCache, filePath, version, itemsKey, applyItems],
  );

  const reload = useCallback(() => {
    if (!userId) return;
    void fetchRemote().then((r) => {
      const p = purgeExpired(r, Date.now());
      applyItems(p);
      writeCache(userId, p);
    });
  }, [userId, fetchRemote, writeCache, applyItems]);

  return { items, loading, error, userId, commit, reload };
}
