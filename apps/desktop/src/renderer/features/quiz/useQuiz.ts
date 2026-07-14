import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo } from "../../hooks/useOutline";
import { SEED_CARDS, type SeedCard } from "./quizData";

/**
 * Self-test question bank with SM-2 spaced repetition, synced to WebDAV
 * (坚果云) so the bank is shared across the team and each user keeps their own
 * progress:
 *   - bank.json               → shared question bank (all users)
 *   - progress-<userId>.json  → per-user review state (SM-2)
 *
 * localStorage mirrors both for instant paint + offline use; WebDAV is the
 * source of truth and is pushed (debounced) on every change. Writes are
 * last-writer-wins (lab scale).
 */

export type Grade = "again" | "hard" | "good" | "easy";
export type SyncStatus = "loading" | "synced" | "saving" | "offline";

export interface Card extends SeedCard {}

export interface ReviewState {
  ease: number;
  intervalDays: number;
  reps: number;
  due: string; // YYYY-MM-DD
  last?: string;
}

type IpcResult<T> = { ok: boolean; data?: T; error?: { message: string } };
type DavGet = { found: boolean; content: string | null };

const BANK_FILE = "自测题库/bank.json";
const progressFile = (uid: string) => `自测题库/progress-${uid}.json`;
const BANK_CACHE = "quiz.bank.cache.v1";
const reviewCache = (uid: string) => `quiz.review.cache.${uid}`;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Math.round(days));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** One SM-2 step for the given grade. */
function schedule(prev: ReviewState | undefined, grade: Grade): ReviewState {
  const today = todayStr();
  const ease = prev?.ease ?? 2.5;
  const reps = prev?.reps ?? 0;

  if (grade === "again") {
    return { ease: Math.max(1.3, ease - 0.2), intervalDays: 0, reps: 0, due: today, last: today };
  }

  let nextEase = ease;
  if (grade === "hard") nextEase = Math.max(1.3, ease - 0.15);
  else if (grade === "easy") nextEase = ease + 0.15;

  let interval: number;
  const nextReps = reps + 1;
  if (reps === 0) interval = grade === "easy" ? 3 : 1;
  else if (reps === 1) interval = grade === "hard" ? 3 : 6;
  else {
    const base = (prev?.intervalDays ?? 1) * nextEase;
    interval =
      grade === "hard"
        ? (prev?.intervalDays ?? 1) * 1.2
        : grade === "easy"
          ? base * 1.3
          : base;
  }

  return { ease: nextEase, intervalDays: interval, reps: nextReps, due: addDays(today, interval), last: today };
}

export type CardStatus = "new" | "due" | "done";

function statusOf(reviews: Record<string, ReviewState>, id: string, today: string): CardStatus {
  const r = reviews[id];
  if (!r) return "new";
  return r.due <= today ? "due" : "done";
}

export function useQuiz(): {
  cards: Card[];
  today: string;
  sync: SyncStatus;
  statusFor: (id: string) => CardStatus;
  dueCards: Card[];
  counts: { total: number; new: number; due: number; done: number };
  grade: (cardId: string, grade: Grade) => void;
  addCard: (c: Omit<Card, "id">) => void;
  editCard: (id: string, patch: Partial<Omit<Card, "id">>) => void;
  deleteCard: (id: string) => void;
  resetProgress: () => void;
} {
  const api = useElectronAPI();
  const { user } = useUserInfo();
  const uid = user?.id ?? null;

  const [cards, setCards] = useState<Card[]>(
    () => readCache<Card[]>(BANK_CACHE) ?? [...SEED_CARDS],
  );
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const [sync, setSync] = useState<SyncStatus>("loading");
  const today = todayStr();

  // --- load shared bank from WebDAV once ---
  const bankLoaded = useRef(false);
  useEffect(() => {
    if (bankLoaded.current) return;
    bankLoaded.current = true;
    void (async () => {
      const res = (await api.webdav.get(BANK_FILE)) as IpcResult<DavGet>;
      if (res.ok && res.data?.found && res.data.content) {
        try {
          const remote = JSON.parse(res.data.content) as Card[];
          setCards(remote);
          writeCache(BANK_CACHE, remote);
        } catch {
          /* keep cache/seed */
        }
      } else if (res.ok && res.data && !res.data.found) {
        // first ever run: seed the shared bank on the server
        writeCache(BANK_CACHE, SEED_CARDS);
        await api.webdav.put(BANK_FILE, JSON.stringify(SEED_CARDS));
      }
      // offline → keep cached/seeded cards
    })();
  }, [api]);

  // --- load per-user progress once uid is known ---
  const loadedUid = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || loadedUid.current === uid) return;
    loadedUid.current = uid;
    setReviews(readCache<Record<string, ReviewState>>(reviewCache(uid)) ?? {});
    void (async () => {
      const res = (await api.webdav.get(progressFile(uid))) as IpcResult<DavGet>;
      if (res.ok && res.data?.found && res.data.content) {
        try {
          const remote = JSON.parse(res.data.content) as Record<string, ReviewState>;
          setReviews(remote);
          writeCache(reviewCache(uid), remote);
        } catch {
          /* keep cache */
        }
        setSync("synced");
      } else if (res.ok) {
        setSync("synced"); // no remote progress yet
      } else {
        setSync("offline");
      }
    })();
  }, [api, uid]);

  // --- debounced pushes ---
  const bankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushBank = useCallback(
    (next: Card[]) => {
      writeCache(BANK_CACHE, next);
      if (bankTimer.current) clearTimeout(bankTimer.current);
      setSync("saving");
      bankTimer.current = setTimeout(async () => {
        const res = (await api.webdav.put(BANK_FILE, JSON.stringify(next))) as IpcResult<unknown>;
        setSync(res.ok ? "synced" : "offline");
      }, 800);
    },
    [api],
  );

  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushReviews = useCallback(
    (next: Record<string, ReviewState>) => {
      if (!uid) return;
      writeCache(reviewCache(uid), next);
      if (reviewTimer.current) clearTimeout(reviewTimer.current);
      setSync("saving");
      reviewTimer.current = setTimeout(async () => {
        const res = (await api.webdav.put(
          progressFile(uid),
          JSON.stringify(next),
        )) as IpcResult<unknown>;
        setSync(res.ok ? "synced" : "offline");
      }, 800);
    },
    [api, uid],
  );

  const statusFor = useCallback((id: string) => statusOf(reviews, id, today), [reviews, today]);

  const dueCards = useMemo(
    () => cards.filter((c) => statusOf(reviews, c.id, today) !== "done"),
    [cards, reviews, today],
  );

  const counts = useMemo(() => {
    let n = 0, d = 0, done = 0;
    for (const c of cards) {
      const s = statusOf(reviews, c.id, today);
      if (s === "new") n++;
      else if (s === "due") d++;
      else done++;
    }
    return { total: cards.length, new: n, due: d, done };
  }, [cards, reviews, today]);

  const grade = useCallback(
    (cardId: string, g: Grade) => {
      setReviews((prev) => {
        const next = { ...prev, [cardId]: schedule(prev[cardId], g) };
        pushReviews(next);
        return next;
      });
    },
    [pushReviews],
  );

  const addCard = useCallback(
    (c: Omit<Card, "id">) => {
      setCards((prev) => {
        const id = `u${Date.now().toString(36)}${prev.length}`;
        const next = [...prev, { ...c, id }];
        pushBank(next);
        return next;
      });
    },
    [pushBank],
  );

  const editCard = useCallback(
    (id: string, patch: Partial<Omit<Card, "id">>) => {
      setCards((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        pushBank(next);
        return next;
      });
    },
    [pushBank],
  );

  const deleteCard = useCallback(
    (id: string) => {
      setCards((prev) => {
        const next = prev.filter((c) => c.id !== id);
        pushBank(next);
        return next;
      });
      setReviews((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        pushReviews(next);
        return next;
      });
    },
    [pushBank, pushReviews],
  );

  const resetProgress = useCallback(() => {
    setReviews(() => {
      pushReviews({});
      return {};
    });
  }, [pushReviews]);

  return {
    cards,
    today,
    sync,
    statusFor,
    dueCards,
    counts,
    grade,
    addCard,
    editCard,
    deleteCard,
    resetProgress,
  };
}
