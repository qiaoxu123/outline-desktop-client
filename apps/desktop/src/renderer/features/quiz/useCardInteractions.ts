import { useCallback, useEffect, useRef, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo } from "../../hooks/useOutline";

/**
 * Shared per-card likes & comments for the quiz, stored on WebDAV
 * (interactions.json) so the whole team sees the same likes/comments.
 *
 * Writes are read-modify-write against the latest server copy and expressed
 * as ABSOLUTE operations (set-my-like, upsert-comment-by-id, remove-by-id) so
 * concurrent edits from different users merge instead of clobbering. Writes
 * are chained locally to avoid races within one client.
 */

export interface CardComment {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: string;
  editedAt?: string;
}

export interface CardEntry {
  likes: Record<string, { name: string; at: string }>;
  comments: CardComment[];
}

export type Interactions = Record<string, CardEntry>;

type IpcResult<T> = { ok: boolean; data?: T; error?: { message: string } };
type DavGet = { found: boolean; content: string | null };

const FILE = "interactions.json";
const CACHE = "quiz.interactions.cache.v1";

function readCache(): Interactions {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Interactions;
  } catch {
    return {};
  }
}
function writeCache(v: Interactions): void {
  try {
    localStorage.setItem(CACHE, JSON.stringify(v));
  } catch {
    /* best-effort */
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function entry(data: Interactions, cardId: string): CardEntry {
  return data[cardId] ?? { likes: {}, comments: [] };
}

function setLike(
  data: Interactions,
  cardId: string,
  uid: string,
  name: string,
  liked: boolean,
): Interactions {
  const e = { likes: { ...entry(data, cardId).likes }, comments: [...entry(data, cardId).comments] };
  if (liked) e.likes[uid] = { name, at: nowIso() };
  else delete e.likes[uid];
  const next = { ...data, [cardId]: e };
  if (Object.keys(e.likes).length === 0 && e.comments.length === 0) delete next[cardId];
  return next;
}

function upsertComment(
  data: Interactions,
  cardId: string,
  comment: CardComment,
): Interactions {
  const e = entry(data, cardId);
  const existing = e.comments.find((c) => c.id === comment.id);
  const comments = existing
    ? e.comments.map((c) => (c.id === comment.id ? comment : c))
    : [...e.comments, comment];
  return { ...data, [cardId]: { likes: { ...e.likes }, comments } };
}

function removeComment(
  data: Interactions,
  cardId: string,
  commentId: string,
): Interactions {
  const e = entry(data, cardId);
  const comments = e.comments.filter((c) => c.id !== commentId);
  const next = { ...data, [cardId]: { likes: { ...e.likes }, comments } };
  if (Object.keys(next[cardId].likes).length === 0 && comments.length === 0) delete next[cardId];
  return next;
}

export interface CardSummary {
  likeCount: number;
  likedByMe: boolean;
  likers: string[];
  comments: CardComment[];
}

export function useCardInteractions(): {
  me: { id: string; name: string } | null;
  summaryFor: (cardId: string) => CardSummary;
  toggleLike: (cardId: string) => void;
  addComment: (cardId: string, text: string) => void;
  editComment: (cardId: string, commentId: string, text: string) => void;
  deleteComment: (cardId: string, commentId: string) => void;
} {
  const api = useElectronAPI();
  const { user } = useUserInfo();
  const me = user ? { id: user.id, name: user.name ?? "我" } : null;

  const [data, setData] = useState<Interactions>(() => readCache());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      const res = (await api.webdav.get(FILE)) as IpcResult<DavGet>;
      if (res.ok && res.data?.found && res.data.content) {
        try {
          const remote = JSON.parse(res.data.content) as Interactions;
          setData(remote);
          writeCache(remote);
        } catch {
          /* keep cache */
        }
      }
    })();
  }, [api]);

  // apply an absolute mutation optimistically + read-modify-write to WebDAV
  const commit = useCallback(
    (mutate: (cur: Interactions) => Interactions) => {
      setData((prev) => {
        const next = mutate(prev);
        writeCache(next);
        return next;
      });
      chain.current = chain.current.then(async () => {
        try {
          const res = (await api.webdav.get(FILE)) as IpcResult<DavGet>;
          let latest: Interactions = {};
          if (res.ok && res.data?.found && res.data.content) {
            try {
              latest = JSON.parse(res.data.content) as Interactions;
            } catch {
              /* treat as empty */
            }
          }
          const merged = mutate(latest);
          await api.webdav.put(FILE, JSON.stringify(merged));
          setData(merged);
          writeCache(merged);
        } catch (err) {
          console.error("[quiz] interaction write failed:", err);
        }
      });
    },
    [api],
  );

  const summaryFor = useCallback(
    (cardId: string): CardSummary => {
      const e = entry(data, cardId);
      const likers = Object.values(e.likes).map((l) => l.name);
      return {
        likeCount: likers.length,
        likedByMe: !!(me && e.likes[me.id]),
        likers,
        comments: [...e.comments].sort((a, b) => a.at.localeCompare(b.at)),
      };
    },
    [data, me],
  );

  const toggleLike = useCallback(
    (cardId: string) => {
      if (!me) return;
      const liked = !!entry(data, cardId).likes[me.id];
      commit((cur) => setLike(cur, cardId, me.id, me.name, !liked));
    },
    [commit, data, me],
  );

  const addComment = useCallback(
    (cardId: string, text: string) => {
      if (!me || !text.trim()) return;
      const comment: CardComment = {
        id: `c${me.id.slice(0, 6)}${Date.now().toString(36)}`,
        userId: me.id,
        name: me.name,
        text: text.trim(),
        at: nowIso(),
      };
      commit((cur) => upsertComment(cur, cardId, comment));
    },
    [commit, me],
  );

  const editComment = useCallback(
    (cardId: string, commentId: string, text: string) => {
      if (!me || !text.trim()) return;
      commit((cur) => {
        const existing = entry(cur, cardId).comments.find((c) => c.id === commentId);
        if (!existing || existing.userId !== me.id) return cur; // only own
        return upsertComment(cur, cardId, {
          ...existing,
          text: text.trim(),
          editedAt: nowIso(),
        });
      });
    },
    [commit, me],
  );

  const deleteComment = useCallback(
    (cardId: string, commentId: string) => {
      if (!me) return;
      commit((cur) => {
        const existing = entry(cur, cardId).comments.find((c) => c.id === commentId);
        if (!existing || existing.userId !== me.id) return cur; // only own
        return removeComment(cur, cardId, commentId);
      });
    },
    [commit, me],
  );

  return { me, summaryFor, toggleLike, addComment, editComment, deleteComment };
}
