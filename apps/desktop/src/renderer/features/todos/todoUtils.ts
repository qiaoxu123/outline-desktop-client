import type { Priority, Todo } from "./types";

export type Bucket = "overdue" | "today" | "soon" | "later" | "none";

export const PRIORITY_RANK: Record<"high" | "mid" | "low", number> = {
  high: 0,
  mid: 1,
  low: 2,
};
const priorityScore = (p: Priority): number =>
  p ? PRIORITY_RANK[p] : 3;

/** Local day key YYYY-MM-DD for a Date. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Days from today to a YYYY-MM-DD due date (negative = overdue). */
export function daysUntil(due: string, today = todayKey()): number {
  const a = new Date(today + "T00:00:00");
  const b = new Date(due + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function bucketOf(todo: Todo, today = todayKey()): Bucket {
  if (!todo.dueDate) return "none";
  const d = daysUntil(todo.dueDate, today);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

/** Sort within a bucket: priority high→low, then due asc, then created asc. */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const p = priorityScore(a.priority) - priorityScore(b.priority);
    if (p !== 0) return p;
    const ad = a.dueDate ?? "9999-99-99";
    const bd = b.dueDate ?? "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export const BUCKET_ORDER: Bucket[] = [
  "overdue",
  "today",
  "soon",
  "later",
  "none",
];
export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "已逾期",
  today: "今天",
  soon: "即将（7 天内）",
  later: "以后",
  none: "无期限",
};

/** Group live, undone todos into ordered buckets (empty buckets omitted). */
export function groupTodos(
  todos: Todo[],
  today = todayKey(),
): { bucket: Bucket; items: Todo[] }[] {
  const map = new Map<Bucket, Todo[]>();
  for (const t of todos) {
    const b = bucketOf(t, today);
    const arr = map.get(b) ?? [];
    arr.push(t);
    map.set(b, arr);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
    bucket: b,
    items: sortTodos(map.get(b)!),
  }));
}

export function toMarkdownExport(todos: Todo[]): string {
  const live = todos.filter((t) => !t.deletedAt);
  const undone = live.filter((t) => !t.done);
  const done = live.filter((t) => t.done);
  const lines: string[] = ["# 待办导出\n"];
  const fmt = (t: Todo): string => {
    const box = t.done ? "- [x]" : "- [ ]";
    const bits: string[] = [t.text];
    if (t.dueDate) bits.push(`（截止 ${t.dueDate}）`);
    if (t.priority) bits.push(`[${t.priority}]`);
    let line = `${box} ${bits.join(" ")}`;
    if (t.links.length)
      line +=
        " " +
        t.links
          .map((l) => `[${l.title}](outline://document/${l.docId})`)
          .join(" ");
    return line;
  };
  lines.push("## 未完成");
  for (const t of sortTodos(undone)) lines.push(fmt(t));
  lines.push("\n## 已完成");
  for (const t of done.sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
  ))
    lines.push(fmt(t));
  return lines.join("\n");
}
