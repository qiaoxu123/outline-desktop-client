import { useCallback, useMemo, useState } from "react";
import { SEED_CARDS, type SeedCard } from "./quizData";

/**
 * Self-test question bank with SM-2 spaced repetition, stored entirely in the
 * browser's localStorage (no Outline backend). The seed bank ships in
 * quizData.ts; the live bank + per-card review state persist locally so cards
 * can be added / edited / removed and review progress survives restarts.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface Card extends SeedCard {}

export interface ReviewState {
  /** SM-2 ease factor (>= 1.3) */
  ease: number;
  /** current interval in days */
  intervalDays: number;
  /** number of successful repetitions in a row */
  reps: number;
  /** next due date (YYYY-MM-DD) */
  due: string;
  /** last reviewed date (YYYY-MM-DD) */
  last?: string;
}

const BANK_KEY = "quiz.bank.v1";
const REVIEW_KEY = "quiz.review.v1";

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

function loadBank(): Card[] {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (raw) return JSON.parse(raw) as Card[];
  } catch {
    /* fall through to seed */
  }
  // first run: seed from the bundled default
  localStorage.setItem(BANK_KEY, JSON.stringify(SEED_CARDS));
  return [...SEED_CARDS];
}

function saveBank(cards: Card[]): void {
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(cards));
  } catch {
    /* best-effort */
  }
}

function loadReviews(): Record<string, ReviewState> {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "{}") as Record<
      string,
      ReviewState
    >;
  } catch {
    return {};
  }
}

function saveReviews(r: Record<string, ReviewState>): void {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(r));
  } catch {
    /* best-effort */
  }
}

/** Apply one SM-2 step for the given grade. */
function schedule(prev: ReviewState | undefined, grade: Grade): ReviewState {
  const today = todayStr();
  const ease = prev?.ease ?? 2.5;
  const reps = prev?.reps ?? 0;

  if (grade === "again") {
    // lapse: relearn from scratch, drop ease, due again today
    return {
      ease: Math.max(1.3, ease - 0.2),
      intervalDays: 0,
      reps: 0,
      due: today,
      last: today,
    };
  }

  let nextEase = ease;
  if (grade === "hard") nextEase = Math.max(1.3, ease - 0.15);
  else if (grade === "easy") nextEase = ease + 0.15;

  let interval: number;
  const nextReps = reps + 1;
  if (reps === 0) {
    interval = grade === "easy" ? 3 : 1;
  } else if (reps === 1) {
    interval = grade === "hard" ? 3 : 6;
  } else {
    const base = (prev?.intervalDays ?? 1) * nextEase;
    interval =
      grade === "hard"
        ? (prev?.intervalDays ?? 1) * 1.2
        : grade === "easy"
          ? base * 1.3
          : base;
  }

  return {
    ease: nextEase,
    intervalDays: interval,
    reps: nextReps,
    due: addDays(today, interval),
    last: today,
  };
}

export type CardStatus = "new" | "due" | "done";

export function statusOf(
  reviews: Record<string, ReviewState>,
  cardId: string,
  today: string,
): CardStatus {
  const r = reviews[cardId];
  if (!r) return "new";
  return r.due <= today ? "due" : "done";
}

export function useQuiz(): {
  cards: Card[];
  reviews: Record<string, ReviewState>;
  today: string;
  statusFor: (id: string) => CardStatus;
  dueCards: Card[];
  counts: { total: number; new: number; due: number; done: number };
  grade: (cardId: string, grade: Grade) => void;
  addCard: (c: Omit<Card, "id">) => void;
  editCard: (id: string, patch: Partial<Omit<Card, "id">>) => void;
  deleteCard: (id: string) => void;
  resetProgress: () => void;
} {
  const [cards, setCards] = useState<Card[]>(() => loadBank());
  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() =>
    loadReviews(),
  );
  const today = todayStr();

  const statusFor = useCallback(
    (id: string) => statusOf(reviews, id, today),
    [reviews, today],
  );

  const dueCards = useMemo(
    // review queue: cards never seen (new) or whose due date has arrived
    () => cards.filter((c) => statusOf(reviews, c.id, today) !== "done"),
    [cards, reviews, today],
  );

  const counts = useMemo(() => {
    let n = 0;
    let d = 0;
    let done = 0;
    for (const c of cards) {
      const s = statusOf(reviews, c.id, today);
      if (s === "new") n++;
      else if (s === "due") d++;
      else done++;
    }
    return { total: cards.length, new: n, due: d, done };
  }, [cards, reviews, today]);

  const grade = useCallback((cardId: string, g: Grade) => {
    setReviews((prev) => {
      const next = { ...prev, [cardId]: schedule(prev[cardId], g) };
      saveReviews(next);
      return next;
    });
  }, []);

  const addCard = useCallback((c: Omit<Card, "id">) => {
    setCards((prev) => {
      const id = `u${Date.now().toString(36)}${Math.floor(prev.length)}`;
      const next = [...prev, { ...c, id }];
      saveBank(next);
      return next;
    });
  }, []);

  const editCard = useCallback(
    (id: string, patch: Partial<Omit<Card, "id">>) => {
      setCards((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        saveBank(next);
        return next;
      });
    },
    [],
  );

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveBank(next);
      return next;
    });
    setReviews((prev) => {
      const next = { ...prev };
      delete next[id];
      saveReviews(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    setReviews(() => {
      saveReviews({});
      return {};
    });
  }, []);

  return {
    cards,
    reviews,
    today,
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
