import { useEffect, useMemo, useRef, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUIStore } from "../../state/uiStore";
import { useUserInfo } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import { readProfileStorage, writeProfileStorage } from "../../lib/profileStorage";

/**
 * Discuss-board topic likes + view counts — the forum-list counterparts of the
 * paper library's like/view features.
 *
 * Likes live on WebDAV (坚果云) so the whole team shares one count, keyed by
 * topic doc id → user id (presence = liked). View counts come from views.list
 * per topic, fetched in small concurrent batches and cached.
 */

type IpcResult<T> = { ok: boolean; data?: T; error?: { message: string } };
type DavGet = { found: boolean; content: string | null };

interface LikeEntry {
  name: string;
  at: string;
}
interface LikeData {
  version: 1;
  /** topicId -> userId -> entry */
  topics: Record<string, Record<string, LikeEntry>>;
}

const EMPTY: LikeData = { version: 1, topics: {} };
const IX_FILE = "讨论区/likes.json";
const IX_CACHE = "discuss.likes.cache.v1";

function parse(content: string | null | undefined): LikeData {
  if (!content) return EMPTY;
  try {
    const d = JSON.parse(content) as LikeData;
    return d && typeof d.topics === "object" ? d : EMPTY;
  } catch {
    return EMPTY;
  }
}
function readCache(profileId: string | null): LikeData {
  try {
    return parse(readProfileStorage(profileId, IX_CACHE));
  } catch {
    return EMPTY;
  }
}
function writeCache(profileId: string | null, v: LikeData): void {
  try {
    writeProfileStorage(profileId, IX_CACHE, JSON.stringify(v));
  } catch {
    /* best-effort */
  }
}

function toggleEntry(
  data: LikeData,
  topicId: string,
  userId: string,
  userName: string,
): LikeData {
  const users = { ...(data.topics[topicId] ?? {}) };
  if (users[userId]) delete users[userId];
  else users[userId] = { name: userName, at: new Date().toISOString() };
  const topics = { ...data.topics };
  if (Object.keys(users).length === 0) delete topics[topicId];
  else topics[topicId] = users;
  return { version: 1, topics };
}

export interface DiscussLikeInfo {
  count: number;
  mine: boolean;
}

export function useDiscussLikes(): {
  likeInfo: (topicId: string) => DiscussLikeInfo;
  toggleLike: (topicId: string) => void;
  canInteract: boolean;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const [data, setData] = useState<LikeData>(() => readCache(activeProfileId));
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    setData(readCache(activeProfileId));
  }, [activeProfileId]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      const res = (await api.webdav.get(IX_FILE)) as IpcResult<DavGet>;
      if (res.ok && res.data?.found) {
        const remote = parse(res.data.content);
        setData(remote);
      writeCache(activeProfileId, remote);
      }
    })();
  }, [api, activeProfileId]);

  const commit = (mutate: (cur: LikeData) => LikeData) => {
    setData((prev) => {
      const next = mutate(prev);
      writeCache(activeProfileId, next);
      return next;
    });
    chainRef.current = chainRef.current.then(async () => {
      try {
        const res = (await api.webdav.get(IX_FILE)) as IpcResult<DavGet>;
        const latest = res.ok && res.data?.found ? parse(res.data.content) : EMPTY;
        const merged = mutate(latest);
        await api.webdav.put(IX_FILE, JSON.stringify(merged, null, 2));
        setData(merged);
        writeCache(activeProfileId, merged);
      } catch (err) {
        console.error("[discuss] like write failed:", err);
      }
    });
  };

  return {
    likeInfo: (topicId) => {
      const users = data.topics[topicId] ?? {};
      return {
        count: Object.keys(users).length,
        mine: !!(user && users[user.id]),
      };
    },
    toggleLike: (topicId) => {
      if (!user) return;
      commit((cur) => toggleEntry(cur, topicId, user.id, user.name ?? ""));
    },
    canInteract: !!user,
  };
}

/* ---------- view counts (batched views.list + cache) ---------- */

// v2: counts distinct viewers (record count), not total view events.
const VIEWS_CACHE_KEY = "discuss.viewsCache.v2";
const VIEWS_REFRESH_MS = 30 * 60_000;

interface ViewsCache {
  savedAt: string;
  views: Record<string, number>;
}

function readViewsCache(profileId: string | null): ViewsCache | null {
  try {
    const raw = readProfileStorage(profileId, VIEWS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ViewsCache) : null;
  } catch {
    return null;
  }
}

export function useDiscussViews(topicIds: string[]): Map<string, number> {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [views, setViews] = useState<Record<string, number>>(
    () => readViewsCache(activeProfileId)?.views ?? {},
  );
  const requestedIdsRef = useRef(new Set<string>());
  const key = topicIds.join(",");

  useEffect(() => {
    if (!activeProfileId || topicIds.length === 0) return;
    const cache = readViewsCache(activeProfileId);
    if (cache && Date.now() - new Date(cache.savedAt).getTime() < VIEWS_REFRESH_MS) {
      return;
    }
    let cancelled = false;
    const ids = topicIds.filter((id) => !requestedIdsRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => requestedIdsRef.current.add(id));
    void (async () => {
      const acc: Record<string, number> = { ...(cache?.views ?? {}) };
      const CONCURRENCY = 8;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (id) => {
            try {
              const res = await unwrapIpc<{ data: { count?: number }[] }>(
                api.call(activeProfileId, "views.list", { documentId: id }),
              );
              // Distinct viewers: one record per user (not sum of view events).
              const total = (res.data ?? []).length;
              return [id, total] as const;
            } catch {
              return [id, acc[id] ?? 0] as const;
            }
          }),
        );
        for (const [id, n] of results) acc[id] = n;
        if (!cancelled) setViews({ ...acc });
      }
      try {
        writeProfileStorage(
          activeProfileId,
          VIEWS_CACHE_KEY,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            views: acc,
          } satisfies ViewsCache),
        );
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, activeProfileId, key]);

  useEffect(() => {
    requestedIdsRef.current.clear();
    setViews(readViewsCache(activeProfileId)?.views ?? {});
  }, [activeProfileId]);

  return useMemo(() => new Map(Object.entries(views)), [views]);
}
