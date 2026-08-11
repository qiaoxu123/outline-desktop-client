/**
 * Shared definition and order persistence for Activity Bar entries.
 * Uses React's useSyncExternalStore for reliable cross-component sync.
 */

import { useSyncExternalStore } from "react";

export interface ActivityEntry {
  key: string;
  label: string;
  icon: string;
  route?: string;
  navigate?: boolean;
}

/** Canonical list — single source of truth for all Activity Bar entries. */
export const ACTIVITY_ENTRIES: ActivityEntry[] = [
  { key: "home", label: "主页", icon: "home", route: "/", navigate: true },
  { key: "search", label: "搜索", icon: "search", route: "/search", navigate: true },
  { key: "papers", label: "论文库", icon: "academicCap", route: "/papers", navigate: true },
  { key: "notes", label: "随记", icon: "note", route: "/notes", navigate: true },
  { key: "discuss", label: "讨论区", icon: "comment", route: "/discuss", navigate: true },
  { key: "quiz", label: "自测题库", icon: "checkbox", route: "/quiz", navigate: true },
  { key: "shares", label: "共享链接", icon: "globe", route: "/shares", navigate: true },
];

const ORDER_KEY = "ui.activityBar.order";

/** Load persisted order, merging in any entries added in newer versions. */
function readOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      const savedSet = new Set(saved);
      const defaults = ACTIVITY_ENTRIES.map((e) => e.key);
      for (const key of defaults) {
        if (!savedSet.has(key)) saved.push(key);
      }
      const validKeys = new Set(defaults);
      return saved.filter((k) => validKeys.has(k));
    }
  } catch { /* ignore corrupt data */ }
  return ACTIVITY_ENTRIES.map((e) => e.key);
}

/* ── tiny external store for useSyncExternalStore ── */

let currentOrder = readOrder();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): string[] {
  return currentOrder;
}

function emitChange(): void {
  for (const cb of listeners) cb();
}

/**
 * React hook: returns [order, setOrder].
 * All components using this hook stay in sync automatically.
 */
export function useActivityBarOrder(): [
  string[],
  (next: string[] | ((prev: string[]) => string[])) => void,
] {
  const order = useSyncExternalStore(subscribe, getSnapshot);

  const setOrder = (next: string[] | ((prev: string[]) => string[])) => {
    const resolved = typeof next === "function" ? next(currentOrder) : next;
    currentOrder = resolved;
    localStorage.setItem(ORDER_KEY, JSON.stringify(resolved));
    emitChange();
  };

  return [order, setOrder];
}
