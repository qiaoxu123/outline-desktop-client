# 随记（Quick Notes）Implementation Plan

> **For agentic workers:** 本仓库无单元测试框架（无 vitest/jest）。每个任务的验证 = `cd apps/desktop && npm run typecheck` + `npm run build`，UI 行为用 CDP（`scratchpad/cdp-eval.mjs` + `npx electron . --remote-debugging-port=9334`）。Steps 用 checkbox 跟踪。

**Goal:** 给客户端加一个 flomo 风格、仅个人可见、WebDAV 存储的「随记」速记本，支持关联 Outline 文档、热力图、标签/搜索、编辑、软删除回收站、批量管理、导出。

**Architecture:** 纯渲染端 feature 模块 `features/notes/`，存储走现成 `webdav:get/put` IPC（主进程零改动），localStorage 镜像 + 读改写串行链保多设备安全。新增 `/notes` 路由与侧边栏项；`DocumentView` 加「＋随记」入口；`api.ts` 白名单补 `documents.search`。

**Tech Stack:** React 19 + TypeScript，@tanstack/react-query（已有），Zustand（已有），electron-vite。

## Global Constraints

- 中文内容用全角标点（，。！？等），半角只留给英文/代码/URL。
- 不新增第三方依赖（热力图/markdown 用现有能力或手写轻量实现）。
- 验证：`npm run typecheck` 与 `npm run build` 必须通过；关键交互 CDP 走查。
- WebDAV 根：`5-共享/Outline桌面端`；随记文件 `随记/<userId>.json`。
- 存储结构 verbatim（见 spec §3.2）：`{version, notes:[{id,content,tags[],createdAt,updatedAt,pinned,deletedAt,links[{docId,urlId,title}]}]}`。
- 排序恒为 `pinned` 优先 → `createdAt` 倒序。软删除 30 天自动物理清理。
- 活动 profileId（CDP 用）：`3afb2552-d5d2-413c-9cc8-f642aa0b441e`。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/renderer/features/notes/types.ts` | `Note`/`NoteLink`/`NotesFile` 类型 + 常量（文件名、cache key、版本） |
| `src/renderer/features/notes/noteUtils.ts` | 纯函数：`parseTags`、`makeId`、`mergeNotes`、`purgeExpired`、`sortNotes`、`computeStreak`、`dayCounts`、`toMarkdownExport` |
| `src/renderer/features/notes/useNotes.ts` | 存储 hook：WebDAV 读改写串行链 + 镜像；`add/update/softDelete/restore/hardDelete/togglePin/bulk*`；派生数据 |
| `src/renderer/features/notes/Heatmap.tsx` | 贡献热力图（按天计数 → 格子 + 月标 + hover + 点击） |
| `src/renderer/features/notes/DocPicker.tsx` | 文档选择器（最近浏览 + 标题搜索） |
| `src/renderer/features/notes/NoteComposer.tsx` | 速记/编辑输入框（textarea + 关联 chip + DocPicker + 保存快捷键）——速记框与卡片编辑态、＋随记 popover 复用 |
| `src/renderer/features/notes/MemoCard.tsx` | 单条卡片（展示/编辑态、操作、标签 chip、关联 chip、复选框） |
| `src/renderer/features/notes/NotesView.tsx` | 路由页编排：速记框、热力图、筛选栏、时间线、管理模式、回收站、导出 |
| `src/renderer/features/notes/NotesView.css` | 全部样式 |
| `src/renderer/features/notes/useQuickNote.ts` | 供 DocumentView「＋随记」复用的轻量 add（预关联当前文档） |
| 改 `src/renderer/App.tsx` | `/notes` 路由 |
| 改 `src/renderer/components/sidebar/Sidebar.tsx` | 侧边栏 navItem |
| 改 `src/renderer/components/outlineIcons.tsx` | 补 `note` 图标（如缺） |
| 改 `src/renderer/features/documents/DocumentView.tsx` | 「＋随记」按钮 + popover |
| 改 `src/main/ipc/handlers/api.ts` | 白名单加 `documents.search` |

---

## Task 1: 类型与纯函数（无 UI，可独立验证）

**Files:**
- Create: `src/renderer/features/notes/types.ts`
- Create: `src/renderer/features/notes/noteUtils.ts`

**Interfaces:**
- Produces:
  - `interface NoteLink { docId: string; urlId?: string; title: string }`
  - `interface Note { id; content; tags: string[]; createdAt; updatedAt; pinned: boolean; deletedAt: string | null; links: NoteLink[] }`
  - `interface NotesFile { version: number; notes: Note[] }`
  - `NOTES_VERSION = 1`, `notesFilePath(userId): string`（→ `随记/<userId>.json`）, `cacheKey(userId): string`
  - `parseTags(content: string): string[]`
  - `makeId(now: number, rand: number): string`（→ `n_<now>_<rand6>`）
  - `mergeNotes(local: Note[], remote: Note[]): Note[]`（并集，同 id 取 updatedAt 较新）
  - `purgeExpired(notes: Note[], nowMs: number): Note[]`（移除 deletedAt 早于 30 天者）
  - `sortNotes(notes: Note[]): Note[]`（pinned 优先→createdAt desc，不改原数组）
  - `dayCounts(notes: Note[]): Map<string, number>`（key `YYYY-MM-DD` 本地日期，仅未删）
  - `computeStreak(dayKeys: Set<string>, todayKey: string): number`
  - `toMarkdownExport(notes: Note[]): string`

- [ ] **Step 1: 写 `types.ts`**

```ts
export const NOTES_VERSION = 1;

export interface NoteLink {
  docId: string;
  urlId?: string;
  title: string;
}

export interface Note {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  deletedAt: string | null;
  links: NoteLink[];
}

export interface NotesFile {
  version: number;
  notes: Note[];
}

export function notesFilePath(userId: string): string {
  return `随记/${userId}.json`;
}

export function cacheKey(userId: string): string {
  return `notes.cache.${userId}.v1`;
}
```

- [ ] **Step 2: 写 `noteUtils.ts`**

```ts
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

function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayCounts(notes: Note[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of notes) {
    if (n.deletedAt) continue;
    const k = dayKey(n.createdAt);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function computeStreak(dayKeys: Set<string>, todayKey: string): number {
  let streak = 0;
  const cur = new Date(todayKey + "T00:00:00");
  // 今天没记则从昨天算起
  if (!dayKeys.has(todayKey)) cur.setDate(cur.getDate() - 1);
  for (;;) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const k = `${y}-${m}-${d}`;
    if (!dayKeys.has(k)) break;
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
      for (const l of n.links) lines.push(`> 关联：[${l.title}](outline://document/${l.docId})`);
    }
    lines.push("\n---\n");
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: 验证**

Run: `cd apps/desktop && npm run typecheck`
Expected: 通过（无引用错误）。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/features/notes/types.ts apps/desktop/src/renderer/features/notes/noteUtils.ts
git commit -m "feat(notes): 随记类型与纯函数(标签解析/合并/排序/热力图计数/导出)"
```

---

## Task 2: 存储 hook `useNotes`

**Files:**
- Create: `src/renderer/features/notes/useNotes.ts`

**Interfaces:**
- Consumes: Task 1 的类型与纯函数；`useElectronAPI()`（`api.webdav.get/put` 返回 `{ok,data}` 信封，需 `unwrapIpc`）；`useUserInfo()`（`user.id`）。
- Produces `useNotes()` 返回：
  - `notes: Note[]`（已 purge、含已删，供派生），`liveNotes: Note[]`（未删），`loading: boolean`，`error: unknown`
  - `add(content: string, links: NoteLink[]): Promise<void>`
  - `update(id: string, content: string, links: NoteLink[]): Promise<void>`
  - `softDelete(id: string): Promise<void>` / `restore(id: string)` / `hardDelete(id: string)`
  - `togglePin(id: string): Promise<void>`
  - `bulkDelete(ids: string[])` / `bulkPin(ids: string[], pinned: boolean)`
  - `exportMarkdown(): string`
  - `reload(): void`

- [ ] **Step 1: 实现 `useNotes.ts`**

关键点：读 WebDAV `webdav:get` 返回 `{found, content}`；写用串行 `chainRef`，每次写前 re-GET → `mergeNotes(current, remote)` → 应用变更 → `webdav:put`；state 与 `localStorage[cacheKey]` 同步；初次加载先读 cache 秒开再拉远端并 `purgeExpired`。

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { useUserInfo } from "../../hooks/useOutline";
import {
  type Note,
  type NoteLink,
  type NotesFile,
  NOTES_VERSION,
  notesFilePath,
  cacheKey,
} from "./types";
import { mergeNotes, parseTags, purgeExpired, makeId, toMarkdownExport } from "./noteUtils";

function readCache(userId: string): Note[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    return (JSON.parse(raw) as NotesFile).notes ?? [];
  } catch {
    return [];
  }
}
function writeCache(userId: string, notes: Note[]): void {
  localStorage.setItem(cacheKey(userId), JSON.stringify({ version: NOTES_VERSION, notes }));
}

export function useNotes() {
  const api = useElectronAPI();
  const { user } = useUserInfo();
  const userId = user?.id ?? null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const fetchRemote = useCallback(async (): Promise<Note[]> => {
    const res = await unwrapIpc<{ found: boolean; content: string | null }>(
      api.webdav.get(notesFilePath(userId!)),
    );
    if (!res.found || !res.content) return [];
    try {
      return (JSON.parse(res.content) as NotesFile).notes ?? [];
    } catch {
      return [];
    }
  }, [api, userId]);

  // 初次加载：cache 秒开 → 远端 → purge → 回写
  useEffect(() => {
    if (!userId) return;
    setNotes(readCache(userId));
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemote();
        const purged = purgeExpired(remote, Date.now());
        if (cancelled) return;
        setNotes(purged);
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
  }, [userId, fetchRemote]);

  // 串行读改写：mutate(current, remote) → 返回新数组
  const commit = useCallback(
    (mutate: (merged: Note[]) => Note[]) => {
      if (!userId) return Promise.resolve();
      const run = async () => {
        const remote = await fetchRemote();
        const base = mergeNotes(readCache(userId), remote);
        const next = purgeExpired(mutate(base), Date.now());
        await unwrapIpc(
          api.webdav.put(
            notesFilePath(userId),
            JSON.stringify({ version: NOTES_VERSION, notes: next }),
          ),
        );
        setNotes(next);
        writeCache(userId, next);
      };
      const p = chainRef.current.then(run, run);
      chainRef.current = p.catch(() => {});
      return p;
    },
    [api, userId, fetchRemote],
  );

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
            ? { ...n, content, tags: parseTags(content), links, updatedAt: nowIso() }
            : n,
        ),
      ),
    [commit],
  );

  const patch = useCallback(
    (id: string, fields: Partial<Note>) =>
      commit((base) =>
        base.map((n) => (n.id === id ? { ...n, ...fields, updatedAt: nowIso() } : n)),
      ),
    [commit],
  );

  const softDelete = useCallback((id: string) => patch(id, { deletedAt: nowIso() }), [patch]);
  const restore = useCallback((id: string) => patch(id, { deletedAt: null }), [patch]);
  const hardDelete = useCallback(
    (id: string) => commit((base) => base.filter((n) => n.id !== id)),
    [commit],
  );
  const togglePin = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: nowIso() } : n)),
      ),
    [commit],
  );
  const bulkDelete = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      return commit((base) =>
        base.map((n) => (set.has(n.id) ? { ...n, deletedAt: nowIso() } : n)),
      );
    },
    [commit],
  );
  const bulkPin = useCallback(
    (ids: string[], pinned: boolean) => {
      const set = new Set(ids);
      return commit((base) =>
        base.map((n) => (set.has(n.id) ? { ...n, pinned, updatedAt: nowIso() } : n)),
      );
    },
    [commit],
  );

  const exportMarkdown = useCallback(() => toMarkdownExport(notes), [notes]);
  const reload = useCallback(() => {
    if (userId) void fetchRemote().then((r) => {
      const p = purgeExpired(r, Date.now());
      setNotes(p);
      writeCache(userId, p);
    });
  }, [userId, fetchRemote]);

  const liveNotes = notes.filter((n) => !n.deletedAt);
  return {
    notes, liveNotes, loading, error, userId,
    add, update, softDelete, restore, hardDelete, togglePin,
    bulkDelete, bulkPin, exportMarkdown, reload,
  };
}
```

- [ ] **Step 2: 验证** `npm run typecheck`（先确认 `useUserInfo` 的 user.id 字段名、`api.webdav` 存在；不符则据实调整）。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/notes/useNotes.ts
git commit -m "feat(notes): useNotes 存储 hook(WebDAV 读改写串行链+镜像+CRUD/批量/导出)"
```

---

## Task 3: 文档选择器 `DocPicker`

**Files:**
- Create: `src/renderer/features/notes/DocPicker.tsx`
- Modify: `src/main/ipc/handlers/api.ts`（`ALLOWED_METHODS` 加 `documents.search`）

**Interfaces:**
- Consumes: `api.call(profileId,"documents.viewed",{limit})`、`api.call(profileId,"documents.search",{query,limit})`；`useUIStore` 的 activeProfileId。
- Produces: `<DocPicker open onClose onPick={(link: NoteLink) => void} existing={NoteLink[]} />`。文档来源两类：`documents.viewed` 返回 `{data:[{document:{id,urlId,title}}]}` 或 `{data:[{id,urlId,title}]}`（据实归一化）；`documents.search` 返回 `{data:[{document:{...}, context}]}`。

- [ ] **Step 1: 白名单加 `documents.search`**

在 `api.ts` `ALLOWED_METHODS` 内 `"documents.viewed",` 附近加一行 `"documents.search",`。

- [ ] **Step 2: 写 `DocPicker.tsx`**（最近浏览 + 搜索，300ms 防抖；点条目 `onPick({docId,urlId,title})`；已在 existing 里的置灰）。实现见 spec §6.1，UI 用 `.doc-picker*` class。

```tsx
import { useEffect, useMemo, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { useUIStore } from "../../state/uiStore";
import type { NoteLink } from "./types";

interface DocHit { id: string; urlId?: string; title: string }

function normalize(rows: unknown[]): DocHit[] {
  return rows
    .map((r) => {
      const o = r as Record<string, unknown>;
      const d = (o.document ?? o) as Record<string, unknown>;
      return { id: d.id as string, urlId: d.urlId as string | undefined, title: (d.title as string) || "无标题" };
    })
    .filter((d) => !!d.id);
}

export default function DocPicker({
  onClose, onPick, existing,
}: {
  onClose: () => void;
  onPick: (link: NoteLink) => void;
  existing: NoteLink[];
}): React.ReactElement {
  const api = useElectronAPI();
  const profileId = useUIStore((s) => s.activeProfileId);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<DocHit[]>([]);
  const [hits, setHits] = useState<DocHit[]>([]);
  const has = useMemo(() => new Set(existing.map((e) => e.docId)), [existing]);

  useEffect(() => {
    if (!profileId) return;
    void unwrapIpc<{ data: unknown[] }>(api.call(profileId, "documents.viewed", { limit: 15 }))
      .then((r) => setRecent(normalize(r.data ?? [])))
      .catch(() => setRecent([]));
  }, [api, profileId]);

  useEffect(() => {
    if (!profileId || !q.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      void unwrapIpc<{ data: unknown[] }>(
        api.call(profileId, "documents.search", { query: q.trim(), limit: 15 }),
      ).then((r) => setHits(normalize(r.data ?? []))).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [api, profileId, q]);

  const list = q.trim() ? hits : recent;
  return (
    <div className="doc-picker-backdrop" onClick={onClose}>
      <div className="doc-picker" onClick={(e) => e.stopPropagation()}>
        <input autoFocus className="doc-picker-input" placeholder="搜索文档标题…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="doc-picker-hint">{q.trim() ? "搜索结果" : "最近浏览"}</div>
        <ul className="doc-picker-list">
          {list.map((d) => (
            <li key={d.id}>
              <button disabled={has.has(d.id)}
                onClick={() => { onPick({ docId: d.id, urlId: d.urlId, title: d.title }); onClose(); }}>
                📄 {d.title}{has.has(d.id) ? "（已关联）" : ""}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="doc-picker-empty">无结果</li>}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证** `npm run typecheck`（确认 `documents.viewed`/`search` 实际返回形状，必要时调 `normalize`）。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers/api.ts apps/desktop/src/renderer/features/notes/DocPicker.tsx
git commit -m "feat(notes): DocPicker 文档选择器(最近浏览+搜索) + 白名单 documents.search"
```

---

## Task 4: 热力图 `Heatmap`

**Files:**
- Create: `src/renderer/features/notes/Heatmap.tsx`

**Interfaces:**
- Consumes: `dayCounts` 结果 `Map<string,number>`。
- Produces: `<Heatmap counts={Map<string,number>} weeks={13} selected={string|null} onSelectDay={(key:string|null)=>void} />`。

- [ ] **Step 1: 写 `Heatmap.tsx`**（7×weeks 网格，列=周，末列含今天；档位 0/1/2-3/4-5/6+；月标按列首出现的月份标一次；hover title；点格 toggle 当天 key）。用 CSS class 着色，避免内联随机。

```tsx
import { useMemo } from "react";

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function level(c: number): number {
  if (c <= 0) return 0;
  if (c <= 1) return 1;
  if (c <= 3) return 2;
  if (c <= 5) return 3;
  return 4;
}

export default function Heatmap({
  counts, weeks = 13, selected, onSelectDay,
}: {
  counts: Map<string, number>;
  weeks?: number;
  selected: string | null;
  onSelectDay: (key: string | null) => void;
}): React.ReactElement {
  const cols = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 末列的周六
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const grid: { key: string; date: Date }[][] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const col: { key: string; date: Date }[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(end);
        d.setDate(end.getDate() - w * 7 - (6 - dow));
        col.push({ key: key(d), date: d });
      }
      grid.push(col);
    }
    return grid;
  }, [weeks]);

  const monthLabels = cols.map((col) => {
    const first = col[0].date;
    return first.getDate() <= 7 ? `${first.getMonth() + 1}月` : "";
  });

  const todayKey = key(new Date());
  return (
    <div className="nt-heatmap">
      <div className="nt-heatmap-grid">
        {cols.map((col, ci) => (
          <div className="nt-heatmap-col" key={ci}>
            {col.map((cell) => {
              const c = counts.get(cell.key) ?? 0;
              const future = cell.key > todayKey;
              return (
                <button
                  key={cell.key}
                  className={`nt-cell lvl${level(c)}${selected === cell.key ? " sel" : ""}${future ? " future" : ""}`}
                  disabled={future}
                  title={`${cell.date.getMonth() + 1}月${cell.date.getDate()}日 · ${c} 条`}
                  onClick={() => onSelectDay(selected === cell.key ? null : cell.key)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="nt-heatmap-months">
        {monthLabels.map((m, i) => (
          <span key={i} className="nt-month">{m}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证** `npm run typecheck`。
- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/notes/Heatmap.tsx
git commit -m "feat(notes): flomo 式贡献热力图组件"
```

---

## Task 5: 输入框 `NoteComposer` + 卡片 `MemoCard`

**Files:**
- Create: `src/renderer/features/notes/NoteComposer.tsx`
- Create: `src/renderer/features/notes/MemoCard.tsx`

**Interfaces:**
- `NoteComposer`：`<NoteComposer initialContent? initialLinks? autoFocus? placeholder? submitLabel? onSubmit={(content,links)=>void} onCancel? />`。内部管理 textarea 与 links chip、`🔗 关联文档`（开 DocPicker）、`⌘/Ctrl+Enter` 提交、`Esc` 取消。空内容禁用提交。
- `MemoCard`：`<MemoCard note onEdit onDelete onTogglePin onCopy onOpenDoc onToggleTag selectMode selected onToggleSelect />`。展示态渲染标签 chip、关联 chip；hover 操作。

- [ ] **Step 1: 写 `NoteComposer.tsx`**（含标签渲染工具 `renderContent` 供 MemoCard 复用——放到本文件 export 或单独 `renderNote.tsx`；这里放 export）。

```tsx
import { useState } from "react";
import DocPicker from "./DocPicker";
import type { NoteLink } from "./types";

export default function NoteComposer({
  initialContent = "", initialLinks = [], autoFocus, placeholder, submitLabel = "保存",
  onSubmit, onCancel,
}: {
  initialContent?: string;
  initialLinks?: NoteLink[];
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (content: string, links: NoteLink[]) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [content, setContent] = useState(initialContent);
  const [links, setLinks] = useState<NoteLink[]>(initialLinks);
  const [picking, setPicking] = useState(false);

  const submit = () => {
    if (!content.trim()) return;
    onSubmit(content.trim(), links);
    if (!onCancel) { setContent(""); setLinks([]); } // 顶部速记框保存后清空
  };

  return (
    <div className="nt-composer">
      <textarea
        className="nt-composer-input"
        autoFocus={autoFocus}
        placeholder={placeholder ?? "记点什么…（#标签 归类，⌘/Ctrl+Enter 保存）"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
          else if (e.key === "Escape" && onCancel) onCancel();
        }}
      />
      {links.length > 0 && (
        <div className="nt-composer-links">
          {links.map((l) => (
            <span className="nt-link-chip" key={l.docId}>
              📄 {l.title}
              <button onClick={() => setLinks(links.filter((x) => x.docId !== l.docId))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="nt-composer-bar">
        <button className="nt-link-btn" onClick={() => setPicking(true)}>🔗 关联文档</button>
        <span className="nt-spacer" />
        {onCancel && <button className="nt-btn subtle" onClick={onCancel}>取消</button>}
        <button className="nt-btn primary" disabled={!content.trim()} onClick={submit}>{submitLabel}</button>
      </div>
      {picking && (
        <DocPicker
          existing={links}
          onClose={() => setPicking(false)}
          onPick={(l) => setLinks((prev) => (prev.some((x) => x.docId === l.docId) ? prev : [...prev, l]))}
        />
      )}
    </div>
  );
}

// 正文渲染：#标签 → chip，URL 自动链接，其余转义 + 换行
export function renderContent(
  content: string,
  onTag: (t: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /#([^\s#.,;!?，。；！？、）)\]】]+)|(https?:\/\/[^\s]+)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    if (m[1]) {
      const tag = m[1];
      parts.push(<button className="nt-tag" key={i++} onClick={() => onTag(tag)}>#{tag}</button>);
    } else if (m[2]) {
      parts.push(<a className="nt-url" key={i++} href={m[2]} target="_blank" rel="noreferrer">{m[2]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}
```

- [ ] **Step 2: 写 `MemoCard.tsx`**（展示/编辑态；编辑态复用 `NoteComposer`；相对时间 `timeAgo`）。

```tsx
import { useState } from "react";
import NoteComposer, { renderContent } from "./NoteComposer";
import type { Note, NoteLink } from "./types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

export default function MemoCard({
  note, onEdit, onDelete, onTogglePin, onCopy, onOpenDoc, onToggleTag,
  selectMode, selected, onToggleSelect,
}: {
  note: Note;
  onEdit: (content: string, links: NoteLink[]) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onCopy: () => void;
  onOpenDoc: (docId: string) => void;
  onToggleTag: (tag: string) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (editing) {
    return (
      <div className="nt-card editing">
        <NoteComposer
          initialContent={note.content}
          initialLinks={note.links}
          submitLabel="更新"
          autoFocus
          onSubmit={(c, l) => { onEdit(c, l); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className={`nt-card${note.pinned ? " pinned" : ""}`}>
      {selectMode && (
        <input type="checkbox" className="nt-card-check" checked={selected} onChange={onToggleSelect} />
      )}
      <div className="nt-card-head">
        <span className="nt-card-time" title={new Date(note.createdAt).toLocaleString()}>
          {note.pinned && "📌 "}{timeAgo(note.createdAt)}
        </span>
        <span className="nt-card-actions">
          <button onClick={() => setEditing(true)} title="编辑">编辑</button>
          <button onClick={onTogglePin} title={note.pinned ? "取消置顶" : "置顶"}>{note.pinned ? "取消置顶" : "置顶"}</button>
          <button onClick={onCopy} title="复制">复制</button>
          <button className={confirmDel ? "danger" : ""}
            onClick={() => { if (confirmDel) onDelete(); else setConfirmDel(true); }}
            onMouseLeave={() => setConfirmDel(false)}>
            {confirmDel ? "确认删除？" : "删除"}
          </button>
        </span>
      </div>
      <div className="nt-card-body">{renderContent(note.content, onToggleTag)}</div>
      {note.links.length > 0 && (
        <div className="nt-card-links">
          {note.links.map((l) => (
            <button className="nt-doc-chip" key={l.docId} onClick={() => onOpenDoc(l.docId)}>📄 {l.title}</button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证** `npm run typecheck`。
- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/features/notes/NoteComposer.tsx apps/desktop/src/renderer/features/notes/MemoCard.tsx
git commit -m "feat(notes): NoteComposer 输入框(含关联chip/快捷键) + MemoCard 卡片(展示/编辑态)"
```

---

## Task 6: 页面编排 `NotesView` + 样式 + 路由 + 侧边栏

**Files:**
- Create: `src/renderer/features/notes/NotesView.tsx`
- Create: `src/renderer/features/notes/NotesView.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/sidebar/Sidebar.tsx`
- Modify: `src/renderer/components/outlineIcons.tsx`（如需 `note` 图标）

**Interfaces:**
- Consumes: `useNotes`、`Heatmap`、`NoteComposer`、`MemoCard`、`dayCounts`/`computeStreak`/`sortNotes`；`useNavigate`（打开文档 `/document/<docId>`）。

- [ ] **Step 1: 写 `NotesView.tsx`**（编排：顶部速记框；统计行；热力图；筛选栏[标签+搜索+清除]；管理模式工具条[批量删/批量置顶/导出/回收站开关]；时间线；回收站列表[恢复/彻底删除]。日筛选/标签/搜索三者叠加 filter）。导出用 `<a download>` Blob。

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "./useNotes";
import Heatmap from "./Heatmap";
import NoteComposer from "./NoteComposer";
import MemoCard from "./MemoCard";
import { dayCounts, computeStreak, sortNotes } from "./noteUtils";
import "./NotesView.css";

export default function NotesView(): React.ReactElement {
  const nav = useNavigate();
  const n = useNotes();
  const [tag, setTag] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = useState(false);

  const counts = useMemo(() => dayCounts(n.liveNotes), [n.liveNotes]);
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const note of n.liveNotes) for (const t of note.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [n.liveNotes]);
  const streak = useMemo(() => computeStreak(new Set(counts.keys()),
    new Date().toISOString().slice(0, 10)), [counts]);

  const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10) &&
    (() => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();

  const filtered = useMemo(() => {
    let rows = n.liveNotes;
    if (tag) rows = rows.filter((r) => r.tags.includes(tag));
    if (day) rows = rows.filter((r) => dayKey(r.createdAt) === day);
    if (q.trim()) rows = rows.filter((r) => r.content.toLowerCase().includes(q.trim().toLowerCase()));
    return sortNotes(rows);
  }, [n.liveNotes, tag, day, q]);

  const trashed = useMemo(() => n.notes.filter((x) => x.deletedAt)
    .sort((a, b) => (b.deletedAt! > a.deletedAt! ? 1 : -1)), [n.notes]);

  const hasFilter = !!tag || !!day || !!q.trim();
  const toggleSel = (id: string) =>
    setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  const exportMd = () => {
    const blob = new Blob([n.exportMarkdown()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `随记导出-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="notes-view">
      <header className="nt-header">
        <h2>随记</h2>
        <div className="nt-stats">共 {n.liveNotes.length} 条 · {allTags.length} 个标签 · 连续 {streak} 天</div>
        <div className="nt-header-actions">
          <button className="nt-btn subtle" onClick={() => setTrashOpen((v) => !v)}>回收站{trashed.length ? `(${trashed.length})` : ""}</button>
          <button className="nt-btn subtle" onClick={exportMd}>导出</button>
          <button className={`nt-btn subtle${manage ? " active" : ""}`} onClick={() => { setManage((v) => !v); setSel(new Set()); }}>管理</button>
        </div>
      </header>

      {trashOpen ? (
        <section className="nt-trash">
          <h3>回收站（30 天后自动清理）</h3>
          {trashed.length === 0 && <p className="nt-empty">回收站是空的。</p>}
          {trashed.map((note) => (
            <div className="nt-card trashed" key={note.id}>
              <div className="nt-card-body">{note.content}</div>
              <div className="nt-card-actions">
                <button onClick={() => n.restore(note.id)}>恢复</button>
                <button className="danger" onClick={() => n.hardDelete(note.id)}>彻底删除</button>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <>
          <NoteComposer onSubmit={(c, l) => void n.add(c, l)} />
          <Heatmap counts={counts} selected={day} onSelectDay={setDay} />

          {(allTags.length > 0 || hasFilter) && (
            <div className="nt-filterbar">
              <input className="nt-search" placeholder="搜索随记…" value={q} onChange={(e) => setQ(e.target.value)} />
              {allTags.map(([t, c]) => (
                <button key={t} className={`nt-tag-pill${tag === t ? " active" : ""}`}
                  onClick={() => setTag(tag === t ? null : t)}>#{t} <span>{c}</span></button>
              ))}
              {hasFilter && <button className="nt-clear" onClick={() => { setTag(null); setDay(null); setQ(""); }}>清除筛选</button>}
            </div>
          )}

          {manage && (
            <div className="nt-manage-bar">
              <span>已选 {sel.size}</span>
              <button disabled={!sel.size} onClick={() => { void n.bulkPin([...sel], true); setSel(new Set()); }}>批量置顶</button>
              <button disabled={!sel.size} className="danger" onClick={() => { void n.bulkDelete([...sel]); setSel(new Set()); }}>批量删除</button>
            </div>
          )}

          <div className="nt-timeline">
            {n.loading && n.liveNotes.length === 0 && <p className="nt-empty">加载中…</p>}
            {!n.loading && filtered.length === 0 && <p className="nt-empty">{hasFilter ? "没有匹配的随记。" : "还没有随记，记下第一条吧。"}</p>}
            {filtered.map((note) => (
              <MemoCard key={note.id} note={note}
                onEdit={(c, l) => void n.update(note.id, c, l)}
                onDelete={() => void n.softDelete(note.id)}
                onTogglePin={() => void n.togglePin(note.id)}
                onCopy={() => void navigator.clipboard.writeText(note.content)}
                onOpenDoc={(id) => nav(`/document/${id}`)}
                onToggleTag={(t) => setTag(tag === t ? null : t)}
                selectMode={manage} selected={sel.has(note.id)} onToggleSelect={() => toggleSel(note.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 写 `NotesView.css`**（卡片、热力图格 lvl0-4 绿阶 + 主题、标签 chip、composer、管理条；参照 DiscussView.css 变量）。热力图绿阶浅/深两套用 `@media (prefers-color-scheme)` 或 `:root[data-theme]`。

- [ ] **Step 3: 路由** —— `App.tsx` import `NotesView` 并在 AppShell 组内加 `<Route path="/notes" element={<NotesView />} />`。

- [ ] **Step 4: 侧边栏** —— `Sidebar.tsx` 在 `sb-quick-nav` 加 `navItem("/notes","随记",<OIcon name="note" size={20} />, true)`；`outlineIcons.tsx` 无 `note` 则补一个（简单便签 svg）。

- [ ] **Step 5: 验证** `npm run typecheck` + `npm run build`。

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/features/notes apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/components/sidebar/Sidebar.tsx apps/desktop/src/renderer/components/outlineIcons.tsx
git commit -m "feat(notes): NotesView 页面(速记/热力图/筛选/管理/回收站/导出) + 路由 + 侧边栏入口"
```

---

## Task 7: 读文档时「＋随记」入口（DocumentView）

**Files:**
- Create: `src/renderer/features/notes/useQuickNote.ts`
- Modify: `src/renderer/features/documents/DocumentView.tsx`

**Interfaces:**
- `useQuickNote()`：返回 `add(content, links)`（复用 `useNotes` 的 add，但 DocumentView 不需整套；直接复用 `useNotes().add` 亦可——本任务用轻量封装避免 DocumentView 拉全量 state）。
- DocumentView 头部加按钮 + popover：预关联当前文档 `{docId: doc.id, urlId: doc.urlId, title: doc.title}`。

- [ ] **Step 1: 写 `useQuickNote.ts`**（直接复用 `useNotes`，导出 `add` 与 `loading`；DocumentView 只调 add）。

```ts
import { useNotes } from "./useNotes";
export function useQuickNote() {
  const { add } = useNotes();
  return { add };
}
```

- [ ] **Step 2: DocumentView 头部加「＋随记」按钮 + popover**（用现有按钮排样式；popover 内嵌 `NoteComposer`，`initialLinks=[当前文档]`，保存后关闭 + toast/无声）。定位当前文档信息来源：DocumentView 已有 `doc`（含 id/urlId/title）。

- [ ] **Step 3: 验证** `npm run typecheck` + `npm run build`。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/features/notes/useQuickNote.ts apps/desktop/src/renderer/features/documents/DocumentView.tsx
git commit -m "feat(notes): 文档视图「＋随记」入口(预关联当前文档)"
```

---

## Task 8: CDP 端到端走查 + 修正

- [ ] **Step 1** 临时挂 `__notes` 句柄（NotesView 内 `if(import.meta.env.DEV) (window as any).__notes = n;`），`npm run build`，`npx electron . --remote-debugging-port=9334`。
- [ ] **Step 2** CDP 脚本走查 spec §10 各项：add→即时+远端有；关联文档；编辑；软删/恢复；批量；热力图点格；导出；多设备合并（构造远端多一条→本地保存不丢）。
- [ ] **Step 3** 修正发现的问题；移除 `__notes` 临时句柄（或 DEV 门控保留）。
- [ ] **Step 4** `npm run typecheck` + `npm run build`。
- [ ] **Step 5: Commit**

```bash
git commit -am "test(notes): CDP 走查修正"
```

---

## Task 9: 发版

- [ ] bump `apps/desktop/package.json` → `1.12.0`；更新根 `CHANGELOG.md`（新功能：随记）。
- [ ] 提交、打 tag `v1.12.0`、push main + 单 tag（走 GitHub Action，不手动打包）。
- [ ] Mac job 完成后取 `dist-mac` 产物安装到 /Applications 验收。

---

## Self-Review

- **Spec 覆盖**：存储§3→T1/T2；内容§4→T1(parseTags)/T5(renderContent)；界面§5→T4/T5/T6；关联§6→T3/T5/T7；编辑管理§7→T2/T5/T6；白名单§9→T3；验证§10→T8；发版→T9。全覆盖。
- **占位符**：无 TODO/TBD；代码均完整。
- **类型一致**：`Note`/`NoteLink`/`NotesFile` 贯穿一致；`useNotes` 暴露的方法名与 T5/T6/T7 调用一致（add/update/softDelete/restore/hardDelete/togglePin/bulkDelete/bulkPin/exportMarkdown）；`renderContent` 在 T5 定义、T5 MemoCard 使用。
- **风险点标注**：`useUserInfo().user.id`、`documents.viewed/search` 返回形状、DocumentView 的 `doc` 字段名，均在对应任务标注「据实调整」——实现时先读真实代码确认。
