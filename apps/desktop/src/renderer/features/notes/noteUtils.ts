import type { Note } from "./types";

// 标签：# 后跟非空白、非常见中英标点的连续字符
const TAG_RE = /#([^\s#.,;!?，。；！？、）)\]】]+)/g;

export function parseTags(content: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(content)) !== null) {
    if (m[1] && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function makeId(nowMs: number, rand: number): string {
  const r = Math.floor(rand * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `n_${nowMs}_${r}`;
}

/** Union by id; on the same id keep the newer updatedAt. Order not guaranteed. */
export function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const byId = new Map<string, Note>();
  for (const n of remote) byId.set(n.id, n);
  for (const n of local) {
    const prev = byId.get(n.id);
    if (!prev || n.updatedAt >= prev.updatedAt) byId.set(n.id, n);
  }
  return [...byId.values()];
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function purgeExpired(notes: Note[], nowMs: number): Note[] {
  return notes.filter(
    (n) => !n.deletedAt || nowMs - new Date(n.deletedAt).getTime() < THIRTY_DAYS,
  );
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Local calendar day key YYYY-MM-DD for an ISO timestamp. */
export function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local day key. */
export function todayKey(): string {
  return dayKeyOf(new Date().toISOString());
}

/** Per-day note counts (live notes only), keyed by local day. */
export function dayCounts(notes: Note[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of notes) {
    if (n.deletedAt) continue;
    const k = dayKeyOf(n.createdAt);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** Consecutive days (ending today, or yesterday if today is empty) with notes. */
export function computeStreak(dayKeys: Set<string>, today: string): number {
  let streak = 0;
  const cur = new Date(today + "T00:00:00");
  if (!dayKeys.has(today)) cur.setDate(cur.getDate() - 1);
  for (;;) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    if (!dayKeys.has(`${y}-${m}-${d}`)) break;
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function toMarkdownExport(notes: Note[]): string {
  const live = notes.filter((n) => !n.deletedAt);
  const sorted = [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lines: string[] = ["# 随记导出\n"];
  for (const n of sorted) {
    lines.push(`## ${new Date(n.createdAt).toLocaleString()}`);
    if (n.tags.length) lines.push(n.tags.map((t) => `#${t}`).join(" "));
    lines.push("");
    lines.push(n.content);
    if (n.links.length) {
      lines.push("");
      for (const l of n.links) {
        lines.push(`> 关联：[${l.title}](outline://document/${l.docId})`);
      }
    }
    lines.push("\n---\n");
  }
  return lines.join("\n");
}
