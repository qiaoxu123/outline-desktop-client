# 大纲笔记（幕布式 Outline）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在桌面客户端新增幕布式大纲笔记：可折叠项目符号树、节点内联 markdown 所见即所得、节点备注、拖拽重排、markdown 源码模式、一键导出为 Outline 文档；数据存 WebDAV 私有单文件。

**Architecture:** React 完全掌控节点树（折叠/拖拽/键盘/备注/源码互转皆纯前端），只有「当前聚焦节点」挂一个 TipTap 内联编辑器做所见即所得；失焦节点用 markdown-it 静态渲染。持久化复用泛型 `useWebdavStore`（`大纲/<userId>.json`，文档级合并）。树变换与序列化是不依赖 React 的纯函数，做 vitest 单测；UI 用 typecheck/lint + CDP 验证。

**Tech Stack:** Electron + React 19 + TypeScript、TipTap（`@tiptap/react` + `tiptap-markdown` + Highlight/Link/Underline）、markdown-it（`lib/markdown`）、`useWebdavStore`、vitest（本计划新增，仅测纯逻辑）。

## Global Constraints

- 语言/标点：生成中文内容用全角标点；代码注释可用英文；技术术语保留英文。（见 [[chinese-punctuation]]）
- 文件规模：单文件 200–400 行为宜、800 上限；多小文件优先。
- 不可变：树变换一律返回新数组，绝不原地改。
- 存储路径固定：`大纲/<userId>.json`，`itemsKey: "outlines"`，`version: 1`，cache key `outline.cache.<userId>.v1`。
- 复用而非新造：markdown 渲染复用 `lib/markdown`；持久化复用 `hooks/useWebdavStore`；图标用 `components/outlineIcons` 的 `OIcon`；导出走 `documents.create` preload。
- 不引入重依赖：拖拽用原生 HTML5 DnD；源码模式用原生 `<textarea>`（不引 CodeMirror）。唯一新增 devDependency 是 vitest（+ @vitejs 无关，vitest 自带）。
- 所有命令在 `apps/desktop/` 下执行（除非注明仓库根）。

---

## File Structure

新增（除注明外均在 `apps/desktop/src/renderer/features/outline/`）：

| 文件 | 职责 |
|---|---|
| `types.ts` | `OutlineNode`/`OutlineDoc`/`OutlineFile` 类型、`outlineFilePath`/`outlineCacheKey`、`makeNodeId`、`emptyNode` |
| `outlineOps.ts` | 纯不可变树变换：find/visible/setText/setNote/toggleCollapse/insertSiblingAfter/indent/outdent/moveUp/moveDown/mergeDelete/dragMove |
| `outlineSerialize.ts` | 树 ↔ 嵌套 markdown（`toMarkdown`/`parseMarkdown`/`toExportMarkdown`） |
| `useOutlines.ts` | 包 `useWebdavStore`：文档 CRUD（add/rename/remove/togglePin）+ `updateNodes(docId, mutate)` |
| `NodeEditor.tsx` | 聚焦节点的 TipTap 内联编辑器（受控，markdown 出入） |
| `OutlineNode.tsx` | 单节点行：折叠三角 + 项目符号 + 标题（聚焦=NodeEditor/失焦=inline md）+ 备注 |
| `OutlineTree.tsx` | 递归渲染可见节点、键盘分发、HTML5 拖拽 |
| `SourceMode.tsx` | 整份大纲 markdown 源码 `<textarea>` 编辑 |
| `ExportDialog.tsx` | 选集合/父文档并调 `documents.create` 导出 |
| `OutlineView.tsx` | 路由页：左文档列表 + 右工具栏/树/源码；聚焦与提交编排 |
| `OutlineView.css` | 样式 |
| `__tests__/outlineOps.test.ts` | outlineOps 单测 |
| `__tests__/outlineSerialize.test.ts` | 序列化往返单测 |

修改：

| 文件 | 改动 |
|---|---|
| `apps/desktop/src/renderer/lib/markdown/renderer.tsx` | 导出 `renderInlineMarkdown(text): string` |
| `apps/desktop/src/renderer/App.tsx` | 加 `/outline` 路由 |
| `apps/desktop/src/renderer/components/sidebar/Sidebar.tsx` | 加「大纲」nav 项 |
| `apps/desktop/package.json` | 加 `vitest` devDependency + `test` 脚本 |
| 仓库根 `package.json` | 加 `test` 透传脚本（可选） |
| `CHANGELOG.md` | 版本条目 |

---

## Task 1: vitest 测试基建

**Files:**
- Modify: `apps/desktop/package.json`（devDependencies + scripts）
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/renderer/features/outline/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` 在 `apps/desktop/` 可运行 vitest；测试文件放 `features/outline/__tests__/*.test.ts`。

- [ ] **Step 1: 安装 vitest**

Run（在 `apps/desktop/`）:
```bash
npm i -D vitest@^2
```
Expected: `package.json` devDependencies 出现 `vitest`。

- [ ] **Step 2: 写 vitest 配置**

Create `apps/desktop/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

// 纯逻辑单测：node 环境即可（不测 DOM/Electron，UI 靠 typecheck + CDP）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: 加 test 脚本**

在 `apps/desktop/package.json` 的 `scripts` 加：
```json
"test": "vitest run",
"test:watch": "vitest"
```
（可选）仓库根 `package.json` 的 `scripts` 加透传：
```json
"test": "npm run test -w apps/desktop"
```

- [ ] **Step 4: 写冒烟测试**

Create `apps/desktop/src/renderer/features/outline/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行**

Run: `npm test`
Expected: PASS，1 passed。

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/vitest.config.ts apps/desktop/src/renderer/features/outline/__tests__/smoke.test.ts package.json package-lock.json
git commit -m "chore: 引入 vitest 用于大纲纯逻辑单测"
```

---

## Task 2: 类型与工具（types.ts）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/types.ts`
- Test: `apps/desktop/src/renderer/features/outline/__tests__/types.test.ts`

**Interfaces:**
- Produces:
  - `OUTLINE_VERSION: number`
  - `interface OutlineNode { id: string; text: string; note?: string; collapsed: boolean; children: OutlineNode[] }`
  - `interface OutlineDoc { id: string; title: string; root: OutlineNode[]; createdAt: string; updatedAt: string; deletedAt: string | null; pinned?: boolean }`
  - `interface OutlineFile { version: number; outlines: OutlineDoc[] }`
  - `outlineFilePath(userId: string): string`
  - `outlineCacheKey(userId: string): string`
  - `makeNodeId(nowMs: number, rand: number): string`
  - `emptyNode(id: string): OutlineNode`

- [ ] **Step 1: 写失败测试**

Create `apps/desktop/src/renderer/features/outline/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { outlineFilePath, outlineCacheKey, makeNodeId, emptyNode } from "../types";

describe("types helpers", () => {
  it("builds per-user file path under 大纲/", () => {
    expect(outlineFilePath("u1")).toBe("大纲/u1.json");
  });
  it("builds versioned cache key", () => {
    expect(outlineCacheKey("u1")).toBe("outline.cache.u1.v1");
  });
  it("makeNodeId is deterministic given inputs", () => {
    expect(makeNodeId(1000, 0.5)).toBe("on_1000_500000");
  });
  it("emptyNode is a blank expanded leaf", () => {
    expect(emptyNode("x")).toEqual({ id: "x", text: "", collapsed: false, children: [] });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- types`
Expected: FAIL（`Cannot find module '../types'`）。

- [ ] **Step 3: 实现 types.ts**

Create `apps/desktop/src/renderer/features/outline/types.ts`:
```ts
import type { StoreItem } from "../../hooks/useWebdavStore";

export const OUTLINE_VERSION = 1;

export interface OutlineNode {
  id: string;
  /** 标题行的内联 markdown 源码（加粗/==高亮==/链接等）。 */
  text: string;
  /** 备注：节点下的长文本 markdown，可选。 */
  note?: string;
  /** 折叠状态：仅视图态，不进导出 markdown。 */
  collapsed: boolean;
  children: OutlineNode[];
}

/** 满足 useWebdavStore 的 StoreItem（id/updatedAt/deletedAt）。 */
export interface OutlineDoc extends StoreItem {
  title: string;
  root: OutlineNode[];
  createdAt: string;
  pinned?: boolean;
}

export interface OutlineFile {
  version: number;
  outlines: OutlineDoc[];
}

/** 每用户私有单文件，位于共享 WebDAV 根下。 */
export function outlineFilePath(userId: string): string {
  return `大纲/${userId}.json`;
}

/** localStorage 镜像 key，用于 WebDAV 就绪前即时上屏。 */
export function outlineCacheKey(userId: string): string {
  return `outline.cache.${userId}.v1`;
}

/** 稳定 id：与 notes.makeId 同风格，前缀区分。 */
export function makeNodeId(nowMs: number, rand: number): string {
  const r = Math.floor(rand * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `on_${nowMs}_${r}`;
}

export function emptyNode(id: string): OutlineNode {
  return { id, text: "", collapsed: false, children: [] };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- types`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/types.ts apps/desktop/src/renderer/features/outline/__tests__/types.test.ts
git commit -m "feat(outline): 大纲数据类型与存储路径工具"
```

---

## Task 3: 树变换纯函数 — 结构与编辑（outlineOps.ts 第一批）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/outlineOps.ts`
- Test: `apps/desktop/src/renderer/features/outline/__tests__/outlineOps.test.ts`

**Interfaces:**
- Consumes: `OutlineNode`（Task 2）
- Produces（全部纯函数，不改入参）:
  - `findNode(root: OutlineNode[], id: string): OutlineNode | null`
  - `visibleNodesInOrder(root: OutlineNode[]): OutlineNode[]`（前序，跳过折叠节点的子树；折叠节点自身仍包含）
  - `setText(root: OutlineNode[], id: string, text: string): OutlineNode[]`
  - `setNote(root: OutlineNode[], id: string, note: string): OutlineNode[]`
  - `toggleCollapse(root: OutlineNode[], id: string): OutlineNode[]`
  - `insertSiblingAfter(root: OutlineNode[], id: string, node: OutlineNode): OutlineNode[]`

- [ ] **Step 1: 写失败测试**

Create `apps/desktop/src/renderer/features/outline/__tests__/outlineOps.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { OutlineNode } from "../types";
import {
  findNode,
  visibleNodesInOrder,
  setText,
  setNote,
  toggleCollapse,
  insertSiblingAfter,
} from "../outlineOps";

const n = (id: string, children: OutlineNode[] = [], collapsed = false): OutlineNode => ({
  id,
  text: id,
  collapsed,
  children,
});

// a
// ├─ b (collapsed) → b1
// └─ c
const tree = (): OutlineNode[] => [n("a", [n("b", [n("b1")], true), n("c")])];

describe("findNode", () => {
  it("finds nested", () => {
    expect(findNode(tree(), "b1")?.id).toBe("b1");
  });
  it("returns null when absent", () => {
    expect(findNode(tree(), "zzz")).toBeNull();
  });
});

describe("visibleNodesInOrder", () => {
  it("skips children of collapsed nodes", () => {
    expect(visibleNodesInOrder(tree()).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("setText / setNote", () => {
  it("setText is immutable and updates one node", () => {
    const before = tree();
    const after = setText(before, "c", "hello");
    expect(findNode(after, "c")?.text).toBe("hello");
    expect(findNode(before, "c")?.text).toBe("c"); // original untouched
  });
  it("setNote sets note", () => {
    expect(findNode(setNote(tree(), "a", "memo"), "a")?.note).toBe("memo");
  });
});

describe("toggleCollapse", () => {
  it("flips collapsed", () => {
    expect(findNode(toggleCollapse(tree(), "b"), "b")?.collapsed).toBe(false);
  });
});

describe("insertSiblingAfter", () => {
  it("inserts right after target at same level", () => {
    const node: OutlineNode = { id: "new", text: "new", collapsed: false, children: [] };
    const after = insertSiblingAfter(tree(), "b", node);
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "new", "c"]);
  });
  it("inserts after a top-level node", () => {
    const node: OutlineNode = { id: "top2", text: "", collapsed: false, children: [] };
    expect(insertSiblingAfter(tree(), "a", node).map((x) => x.id)).toEqual(["a", "top2"]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- outlineOps`
Expected: FAIL（`Cannot find module '../outlineOps'`）。

- [ ] **Step 3: 实现 outlineOps.ts 第一批**

Create `apps/desktop/src/renderer/features/outline/outlineOps.ts`:
```ts
import type { OutlineNode } from "./types";

/** 深度优先查找节点（返回引用，仅供读；写操作走 map 变换）。 */
export function findNode(root: OutlineNode[], id: string): OutlineNode | null {
  for (const node of root) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 前序遍历所有可见节点：折叠节点自身可见，其子树不可见。 */
export function visibleNodesInOrder(root: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (nodes: OutlineNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      if (!node.collapsed) walk(node.children);
    }
  };
  walk(root);
  return out;
}

/** 对匹配 id 的节点应用 patch，返回新树（不可变）。 */
function mapNode(
  root: OutlineNode[],
  id: string,
  patch: (n: OutlineNode) => OutlineNode,
): OutlineNode[] {
  return root.map((node) => {
    if (node.id === id) return patch(node);
    if (node.children.length === 0) return node;
    const children = mapNode(node.children, id, patch);
    return children === node.children ? node : { ...node, children };
  });
}

export function setText(root: OutlineNode[], id: string, text: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, text }));
}

export function setNote(root: OutlineNode[], id: string, note: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, note }));
}

export function toggleCollapse(root: OutlineNode[], id: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, collapsed: !n.collapsed }));
}

/** 在与目标同层、目标之后插入新节点。 */
export function insertSiblingAfter(
  root: OutlineNode[],
  id: string,
  node: OutlineNode,
): OutlineNode[] {
  const idx = root.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const next = root.slice();
    next.splice(idx + 1, 0, node);
    return next;
  }
  return root.map((x) => {
    if (x.children.length === 0) return x;
    const children = insertSiblingAfter(x.children, id, node);
    return children === x.children ? x : { ...x, children };
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- outlineOps`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/outlineOps.ts apps/desktop/src/renderer/features/outline/__tests__/outlineOps.test.ts
git commit -m "feat(outline): 树查找/可见遍历/文本备注/折叠/插入兄弟 纯变换"
```

---

## Task 4: 树变换纯函数 — 移动与合并（outlineOps.ts 第二批）

**Files:**
- Modify: `apps/desktop/src/renderer/features/outline/outlineOps.ts`（追加导出）
- Modify: `apps/desktop/src/renderer/features/outline/__tests__/outlineOps.test.ts`（追加用例）

**Interfaces:**
- Produces:
  - `indent(root, id): OutlineNode[]`（成为前一兄弟的最后一个子节点；无前兄弟时原样返回）
  - `outdent(root, id): OutlineNode[]`（提升为父节点之后的兄弟；已在顶层时原样返回）
  - `moveUp(root, id): OutlineNode[]` / `moveDown(root, id): OutlineNode[]`（同层与相邻兄弟交换；边界原样返回）
  - `mergeDelete(root, id): { root: OutlineNode[]; focusId: string | null; caretOffset: number }`（把本节点 text 并入「上一个可见节点」末尾、子节点接到其后，删除本节点；顶层首节点原样返回且 focusId=null）
  - `dragMove(root, id, targetParentId: string | null, index: number): OutlineNode[]`（移动到目标父（null=顶层）children 的 index 位；目标是自身或自身后代时原样返回）

- [ ] **Step 1: 追加失败测试**

在 `__tests__/outlineOps.test.ts` 末尾追加：
```ts
import { indent, outdent, moveUp, moveDown, mergeDelete, dragMove } from "../outlineOps";

describe("indent / outdent", () => {
  it("indent makes node last child of previous sibling", () => {
    const after = indent(tree(), "c"); // a: [b] , c -> under b
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b"]);
    expect(findNode(after, "b")?.children.map((x) => x.id)).toEqual(["b1", "c"]);
  });
  it("indent is no-op without previous sibling", () => {
    const after = indent(tree(), "b");
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("outdent lifts node to after its parent", () => {
    const after = outdent(tree(), "b1"); // b1 under b -> sibling after b
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "b1", "c"]);
  });
  it("outdent is no-op at top level", () => {
    expect(outdent(tree(), "a").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("moveUp / moveDown", () => {
  it("moveDown swaps with next sibling", () => {
    expect(findNode(moveDown(tree(), "b"), "a")?.children.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("moveUp swaps with previous sibling", () => {
    expect(findNode(moveUp(tree(), "c"), "a")?.children.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("moveUp no-op for first child", () => {
    expect(findNode(moveUp(tree(), "b"), "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("mergeDelete", () => {
  it("merges text into previous visible node and removes self", () => {
    // visible order: a,b,c  → merge c into b
    const r = mergeDelete(tree(), "c");
    expect(r.focusId).toBe("b");
    expect(r.caretOffset).toBe(1); // "b".length
    expect(findNode(r.root, "c")).toBeNull();
    expect(findNode(r.root, "b")?.text).toBe("bc");
  });
  it("no-op for first top node", () => {
    const r = mergeDelete(tree(), "a");
    expect(r.focusId).toBeNull();
    expect(findNode(r.root, "a")).not.toBeNull();
  });
});

describe("dragMove", () => {
  it("moves node under a new parent at index", () => {
    const after = dragMove(tree(), "c", "b", 0); // c -> first child of b
    expect(findNode(after, "b")?.children.map((x) => x.id)).toEqual(["c", "b1"]);
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b"]);
  });
  it("moves node to top level at index", () => {
    const after = dragMove(tree(), "c", null, 0); // c -> top, before a
    expect(after.map((x) => x.id)).toEqual(["c", "a"]);
  });
  it("refuses to move into own descendant", () => {
    const after = dragMove(tree(), "b", "b1", 0); // b into its own child b1 → no-op
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- outlineOps`
Expected: FAIL（新导出未定义）。

- [ ] **Step 3: 追加实现**

在 `outlineOps.ts` 末尾追加：
```ts
/** 定位节点：返回其所在数组、下标、父节点（顶层父为 null）。 */
interface Loc {
  siblings: OutlineNode[];
  index: number;
  parent: OutlineNode | null;
}
function locate(root: OutlineNode[], id: string, parent: OutlineNode | null = null): Loc | null {
  const index = root.findIndex((x) => x.id === id);
  if (index >= 0) return { siblings: root, index, parent };
  for (const node of root) {
    const hit = locate(node.children, id, node);
    if (hit) return hit;
  }
  return null;
}

/** 用「替换某父节点 children」的方式重建树（父为 null 表示顶层）。 */
function replaceChildren(
  root: OutlineNode[],
  parentId: string | null,
  children: OutlineNode[],
): OutlineNode[] {
  if (parentId === null) return children;
  return root.map((node) => {
    if (node.id === parentId) return { ...node, children };
    if (node.children.length === 0) return node;
    const next = replaceChildren(node.children, parentId, children);
    return next === node.children ? node : { ...node, children: next };
  });
}

export function indent(root: OutlineNode[], id: string): OutlineNode[] {
  const loc = locate(root, id);
  if (!loc || loc.index === 0) return root; // 无前兄弟
  const node = loc.siblings[loc.index];
  const prev = loc.siblings[loc.index - 1];
  const newSiblings = loc.siblings.slice();
  newSiblings.splice(loc.index, 1);
  newSiblings[loc.index - 1] = { ...prev, children: [...prev.children, node] };
  return replaceChildren(root, loc.parent ? loc.parent.id : null, newSiblings);
}

export function outdent(root: OutlineNode[], id: string): OutlineNode[] {
  const loc = locate(root, id);
  if (!loc || loc.parent === null) return root; // 已在顶层
  const node = loc.siblings[loc.index];
  const parentLoc = locate(root, loc.parent.id);
  if (!parentLoc) return root;
  // 从父的 children 移除
  const withoutNode = replaceChildren(
    root,
    loc.parent.id,
    loc.siblings.filter((_, i) => i !== loc.index),
  );
  // 插到「父节点之后」的祖父层
  const grandSiblings = parentLoc.siblings;
  const insertAt = parentLoc.index + 1;
  // parentLoc.siblings 来自旧树；需要从 withoutNode 里重新取父层数组
  const freshParentLoc = locate(withoutNode, loc.parent.id);
  const targetSiblings = freshParentLoc ? freshParentLoc.siblings : withoutNode;
  const next = targetSiblings.slice();
  next.splice(insertAt, 0, node);
  return replaceChildren(
    withoutNode,
    freshParentLoc && freshParentLoc.parent ? freshParentLoc.parent.id : null,
    next,
  );
}

function swap(root: OutlineNode[], id: string, delta: -1 | 1): OutlineNode[] {
  const loc = locate(root, id);
  if (!loc) return root;
  const j = loc.index + delta;
  if (j < 0 || j >= loc.siblings.length) return root;
  const next = loc.siblings.slice();
  [next[loc.index], next[j]] = [next[j], next[loc.index]];
  return replaceChildren(root, loc.parent ? loc.parent.id : null, next);
}
export function moveUp(root: OutlineNode[], id: string): OutlineNode[] {
  return swap(root, id, -1);
}
export function moveDown(root: OutlineNode[], id: string): OutlineNode[] {
  return swap(root, id, 1);
}

export interface MergeResult {
  root: OutlineNode[];
  focusId: string | null;
  caretOffset: number;
}
export function mergeDelete(root: OutlineNode[], id: string): MergeResult {
  const order = visibleNodesInOrder(root);
  const pos = order.findIndex((x) => x.id === id);
  if (pos <= 0) return { root, focusId: null, caretOffset: 0 };
  const prev = order[pos - 1];
  const self = order[pos];
  const caretOffset = prev.text.length;
  // 1) 上一节点 text 拼接、并接管 self 的子节点
  let next = setText(root, prev.id, prev.text + self.text);
  const prevNode = findNode(next, prev.id)!;
  next = mapChildren(next, prev.id, [...prevNode.children, ...self.children]);
  // 2) 删除 self（此时 self 已无子内容依赖，直接摘除）
  next = removeNode(next, id);
  return { root: next, focusId: prev.id, caretOffset };
}

/** 替换某节点自身的 children（内部工具）。 */
function mapChildren(root: OutlineNode[], id: string, children: OutlineNode[]): OutlineNode[] {
  return root.map((node) => {
    if (node.id === id) return { ...node, children };
    if (node.children.length === 0) return node;
    const next = mapChildren(node.children, id, children);
    return next === node.children ? node : { ...node, children: next };
  });
}

function removeNode(root: OutlineNode[], id: string): OutlineNode[] {
  const filtered = root.filter((x) => x.id !== id);
  if (filtered.length !== root.length) return filtered;
  return root.map((node) => {
    if (node.children.length === 0) return node;
    const next = removeNode(node.children, id);
    return next === node.children ? node : { ...node, children: next };
  });
}

function isDescendant(node: OutlineNode, maybeChildId: string): boolean {
  for (const c of node.children) {
    if (c.id === maybeChildId || isDescendant(c, maybeChildId)) return true;
  }
  return false;
}

export function dragMove(
  root: OutlineNode[],
  id: string,
  targetParentId: string | null,
  index: number,
): OutlineNode[] {
  if (id === targetParentId) return root;
  const node = findNode(root, id);
  if (!node) return root;
  if (targetParentId && isDescendant(node, targetParentId)) return root; // 禁止移进自身子树
  // 摘除
  const without = removeNode(root, id);
  // 目标 children
  const targetChildren =
    targetParentId === null ? without : findNode(without, targetParentId)?.children ?? null;
  if (targetChildren === null) return root;
  const nextChildren = targetChildren.slice();
  const clamped = Math.max(0, Math.min(index, nextChildren.length));
  nextChildren.splice(clamped, 0, node);
  return replaceChildren(without, targetParentId, nextChildren);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- outlineOps`
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无新错误。

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/outlineOps.ts apps/desktop/src/renderer/features/outline/__tests__/outlineOps.test.ts
git commit -m "feat(outline): 升降级/上下移/合并删除/拖拽移动 纯变换"
```

---

## Task 5: 树 ↔ markdown 序列化（outlineSerialize.ts）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/outlineSerialize.ts`
- Test: `apps/desktop/src/renderer/features/outline/__tests__/outlineSerialize.test.ts`

**Interfaces:**
- Consumes: `OutlineNode`/`OutlineDoc`/`makeNodeId`（Task 2）
- Produces:
  - `toMarkdown(root: OutlineNode[]): string`（每节点 `  `×深度 + `- ` + text；备注按对齐缩进的续写段落，行前缀 = 深度缩进 + 2 空格）
  - `parseMarkdown(md: string): OutlineNode[]`（bullet 行→节点，深度=前导空格/2；紧随其后、缩进更深的非 bullet 行→上一节点 note，多行以 `\n` 连；新 id 用 `makeNodeId`；collapsed 一律 false）
  - `toExportMarkdown(doc: OutlineDoc): string`（`# ${title}\n\n` + toMarkdown）

- [ ] **Step 1: 写失败测试**

Create `apps/desktop/src/renderer/features/outline/__tests__/outlineSerialize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { OutlineNode } from "../types";
import { toMarkdown, parseMarkdown, toExportMarkdown } from "../outlineSerialize";

const strip = (nodes: OutlineNode[]): unknown =>
  nodes.map((n) => ({
    text: n.text,
    note: n.note ?? undefined,
    children: strip(n.children),
  }));

const sample = (): OutlineNode[] => [
  {
    id: "1",
    text: "核心思路",
    collapsed: false,
    children: [
      { id: "2", text: "**核心洞察**：路侧相机固定", note: "多行备注\n第二行", collapsed: false, children: [] },
      { id: "3", text: "研究问题", collapsed: false, children: [] },
    ],
  },
];

describe("toMarkdown", () => {
  it("emits nested bullet list with indented note", () => {
    expect(toMarkdown(sample())).toBe(
      [
        "- 核心思路",
        "  - **核心洞察**：路侧相机固定",
        "    多行备注",
        "    第二行",
        "  - 研究问题",
      ].join("\n"),
    );
  });
});

describe("round-trip", () => {
  it("tree -> md -> tree is structurally stable (ignoring id/collapsed)", () => {
    const md = toMarkdown(sample());
    const back = parseMarkdown(md);
    expect(strip(back)).toEqual(strip(sample()));
  });
});

describe("toExportMarkdown", () => {
  it("prepends H1 title", () => {
    const doc = {
      id: "d",
      title: "论文调研",
      root: sample(),
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    };
    expect(toExportMarkdown(doc).startsWith("# 论文调研\n\n- 核心思路")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- outlineSerialize`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 outlineSerialize.ts**

Create `apps/desktop/src/renderer/features/outline/outlineSerialize.ts`:
```ts
import type { OutlineNode, OutlineDoc } from "./types";
import { makeNodeId } from "./types";

const INDENT = "  "; // 每层 2 空格

export function toMarkdown(root: OutlineNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: OutlineNode[], depth: number): void => {
    const pad = INDENT.repeat(depth);
    for (const node of nodes) {
      lines.push(`${pad}- ${node.text}`);
      if (node.note) {
        // 备注对齐到 bullet 文本下方（缩进 + 2 空格），逐行输出。
        for (const noteLine of node.note.split("\n")) {
          lines.push(`${pad}${INDENT}${noteLine}`);
        }
      }
      if (node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

export function toExportMarkdown(doc: OutlineDoc): string {
  return `# ${doc.title}\n\n${toMarkdown(doc.root)}`;
}

interface Frame {
  node: OutlineNode;
  depth: number;
}

export function parseMarkdown(md: string): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: Frame[] = []; // 栈顶是当前最深祖先
  let seq = 0;
  const nextId = (): string => makeNodeId(0, (++seq % 999999) / 1_000_000);

  const attach = (node: OutlineNode, depth: number): void => {
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  };

  for (const raw of md.split("\n")) {
    if (raw.trim() === "") continue;
    const bullet = raw.match(/^(\s*)- (.*)$/);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / INDENT.length);
      attach({ id: nextId(), text: bullet[2], collapsed: false, children: [] }, depth);
      continue;
    }
    // 非 bullet 行：归为栈顶节点的 note（去掉「其缩进 + 2 空格」的前缀近似）。
    const top = stack[stack.length - 1];
    if (top) {
      const line = raw.replace(/^\s+/, "");
      top.node.note = top.node.note ? `${top.node.note}\n${line}` : line;
    }
  }
  return root;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- outlineSerialize`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/outlineSerialize.ts apps/desktop/src/renderer/features/outline/__tests__/outlineSerialize.test.ts
git commit -m "feat(outline): 树与嵌套 markdown 双向序列化 + 导出"
```

---

## Task 6: 内联 markdown 渲染工具（renderer.tsx）

**Files:**
- Modify: `apps/desktop/src/renderer/lib/markdown/renderer.tsx`

**Interfaces:**
- Produces: `renderInlineMarkdown(text: string): string`（返回内联 HTML；复用已配置的 `md` 实例的 `renderInline`，先经 `normalizeOutlineMarkdown`）

- [ ] **Step 1: 读现状**

Run: `grep -n "^const md\|^const mdBreaks\|createMd\|export function MarkdownRenderer\|normalizeOutlineMarkdown" apps/desktop/src/renderer/lib/markdown/renderer.tsx`
Expected: 能看到模块内 `md` 实例与 `MarkdownRenderer` 导出。确认 `md` 的变量名（若非 `md` 则下步用真实名）。

- [ ] **Step 2: 追加导出**

在 `renderer.tsx` 中 `export default MarkdownRenderer;` 之前追加（若 `md` 变量名不同，替换为实际名）：
```tsx
/**
 * 内联渲染一行 markdown（加粗/斜体/==高亮==/链接/行内代码/行内公式），
 * 不产生块级 <p> 包裹，供大纲节点标题这类单行内容使用。复用主 md 实例。
 */
export function renderInlineMarkdown(text: string): string {
  return md.renderInline(normalizeOutlineMarkdown(text));
}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无新错误（若报 `md` 未定义/私有，改用文件里实际的实例变量名）。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/markdown/renderer.tsx
git commit -m "feat(markdown): 导出 renderInlineMarkdown 供大纲节点内联渲染"
```

---

## Task 7: 存储 hook（useOutlines.ts）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/useOutlines.ts`

**Interfaces:**
- Consumes: `useWebdavStore`（`hooks/useWebdavStore`，`commit(mutate: (base: OutlineDoc[]) => OutlineDoc[])`）、Task 2 类型、`OUTLINE_VERSION`
- Produces:
```ts
interface UseOutlines {
  outlines: OutlineDoc[];      // 未删的，按 updatedAt 倒序
  loading: boolean;
  error: unknown;
  userId: string | null;
  addDoc(title: string): Promise<string>;   // 返回新 doc id
  renameDoc(id: string, title: string): Promise<void>;
  removeDoc(id: string): Promise<void>;      // 软删
  togglePin(id: string): Promise<void>;
  updateNodes(docId: string, mutate: (root: OutlineNode[]) => OutlineNode[]): Promise<void>;
  reload(): void;
}
export function useOutlines(): UseOutlines
```

- [ ] **Step 1: 实现 useOutlines.ts**

Create `apps/desktop/src/renderer/features/outline/useOutlines.ts`:
```ts
import { useCallback } from "react";
import { useWebdavStore } from "../../hooks/useWebdavStore";
import {
  type OutlineDoc,
  type OutlineNode,
  OUTLINE_VERSION,
  outlineFilePath,
  outlineCacheKey,
  makeNodeId,
  emptyNode,
} from "./types";

export interface UseOutlines {
  outlines: OutlineDoc[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  addDoc: (title: string) => Promise<string>;
  renameDoc: (id: string, title: string) => Promise<void>;
  removeDoc: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateNodes: (docId: string, mutate: (root: OutlineNode[]) => OutlineNode[]) => Promise<void>;
  reload: () => void;
}

export function useOutlines(): UseOutlines {
  const store = useWebdavStore<OutlineDoc>({
    version: OUTLINE_VERSION,
    itemsKey: "outlines",
    filePath: outlineFilePath,
    cacheKey: outlineCacheKey,
  });
  const { commit } = store;
  const nowIso = () => new Date().toISOString();

  const addDoc = useCallback(
    async (title: string): Promise<string> => {
      const id = makeNodeId(Date.now(), Math.random());
      const t = nowIso();
      const doc: OutlineDoc = {
        id,
        title: title || "未命名大纲",
        root: [emptyNode(makeNodeId(Date.now(), Math.random()))],
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      };
      await commit((base) => [doc, ...base]);
      return id;
    },
    [commit],
  );

  const patchDoc = useCallback(
    (id: string, fields: Partial<OutlineDoc>) =>
      commit((base) =>
        base.map((d) => (d.id === id ? { ...d, ...fields, updatedAt: nowIso() } : d)),
      ),
    [commit],
  );

  const renameDoc = useCallback((id: string, title: string) => patchDoc(id, { title }), [patchDoc]);
  const removeDoc = useCallback((id: string) => patchDoc(id, { deletedAt: nowIso() }), [patchDoc]);
  const togglePin = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((d) =>
          d.id === id ? { ...d, pinned: !d.pinned, updatedAt: nowIso() } : d,
        ),
      ),
    [commit],
  );

  const updateNodes = useCallback(
    (docId: string, mutate: (root: OutlineNode[]) => OutlineNode[]) =>
      commit((base) =>
        base.map((d) =>
          d.id === docId ? { ...d, root: mutate(d.root), updatedAt: nowIso() } : d,
        ),
      ),
    [commit],
  );

  const outlines = store.items
    .filter((d) => !d.deletedAt)
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return {
    outlines,
    loading: store.loading,
    error: store.error,
    userId: store.userId,
    addDoc,
    renameDoc,
    removeDoc,
    togglePin,
    updateNodes,
    reload: store.reload,
  };
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/useOutlines.ts
git commit -m "feat(outline): useOutlines 存储 hook（文档 CRUD + 节点变换提交）"
```

---

## Task 8: 聚焦节点内联编辑器（NodeEditor.tsx）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/NodeEditor.tsx`

**Interfaces:**
- Consumes: `@tiptap/react`、`@tiptap/starter-kit`、`tiptap-markdown`、`@tiptap/extension-highlight`/`-link`/`-underline`、`highlightRule`
- Produces:
```ts
interface NodeEditorProps {
  initialMarkdown: string;
  autoFocusCaret?: "start" | "end" | number; // 挂载时光标位置
  onChange(markdown: string): void;           // 输入时（防抖由父层做）
  onEnter(before: string, after: string): void;// 光标处切分
  onIndent(): void;
  onOutdent(): void;
  onMergeBackspace(): void;                    // 行首 Backspace
  onMoveUp(): void;
  onMoveDown(): void;
  onToggleCollapse(): void;
  onFocusPrev(): void;                          // ↑ 到首行
  onFocusNext(): void;                          // ↓ 到末行
  onBlur(markdown: string): void;
}
export default function NodeEditor(props: NodeEditorProps): React.ReactElement
```

说明：本组件无 vitest 单测（无 DOM 测试基建），以 `typecheck`/`lint` + 后续 CDP 验证为门槛。TipTap 只启用内联能力；`Enter`/`Tab` 等在 `editorProps.handleKeyDown` 里拦截，读取当前光标前后文本转成 markdown 交给回调。

- [ ] **Step 1: 实现 NodeEditor.tsx**

Create `apps/desktop/src/renderer/features/outline/NodeEditor.tsx`:
```tsx
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";

export interface NodeEditorProps {
  initialMarkdown: string;
  autoFocusCaret?: "start" | "end" | number;
  onChange: (markdown: string) => void;
  onEnter: (before: string, after: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMergeBackspace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onBlur: (markdown: string) => void;
}

// 高亮序列化回 ==...==，与文档编辑器一致（read view 用 markdown-it-mark 渲染）。
const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return { markdown: { serialize: { open: "==", close: "==", expelEnclosingWhitespace: true }, parse: {} } };
  },
}).configure({ multicolor: true });

export default function NodeEditor(props: NodeEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [
      // 只保留内联：关掉块级列表/引用/标题/代码块/分隔线/换行，节点是单行标题。
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      MarkdownHighlight,
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: markdownToDoc(props.initialMarkdown),
    editorProps: {
      handleKeyDown(view, event) {
        const { markdown } = editorStorage(editor);
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const { before, after } = splitAtCaret(view, markdown);
          props.onEnter(before, after);
          return true;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          event.shiftKey ? props.onOutdent() : props.onIndent();
          return true;
        }
        if (event.key === "Backspace" && caretAtStart(view)) {
          event.preventDefault();
          props.onMergeBackspace();
          return true;
        }
        if (event.altKey && event.key === "ArrowUp") {
          event.preventDefault();
          props.onMoveUp();
          return true;
        }
        if (event.altKey && event.key === "ArrowDown") {
          event.preventDefault();
          props.onMoveDown();
          return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === ".") {
          event.preventDefault();
          props.onToggleCollapse();
          return true;
        }
        if (event.key === "ArrowUp" && caretAtStart(view)) {
          event.preventDefault();
          props.onFocusPrev();
          return true;
        }
        if (event.key === "ArrowDown" && caretAtEnd(view)) {
          event.preventDefault();
          props.onFocusNext();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      props.onChange(getMarkdown(editor));
    },
    onBlur({ editor }) {
      props.onBlur(getMarkdown(editor));
    },
  });

  // 挂载后置光标。
  useEffect(() => {
    if (!editor) return;
    const c = props.autoFocusCaret ?? "end";
    if (c === "start") editor.commands.focus("start");
    else if (c === "end") editor.commands.focus("end");
    else editor.commands.focus(c + 1); // markdown offset ≈ doc pos（近似，足够）
  }, [editor]);

  return <EditorContent editor={editor} className="ol-node-editor" />;
}

// ---- 小工具（依赖 tiptap-markdown storage）----
function getMarkdown(editor: { storage: { markdown: { getMarkdown(): string } } }): string {
  return editor.storage.markdown.getMarkdown().trim();
}
function editorStorage(editor: unknown): { markdown: string } {
  const e = editor as { storage?: { markdown?: { getMarkdown(): string } } } | null;
  return { markdown: e?.storage?.markdown?.getMarkdown().trim() ?? "" };
}
function markdownToDoc(md: string): string {
  return md; // tiptap-markdown 解析字符串 content
}
function caretAtStart(view: { state: { selection: { $from: { parentOffset: number }; empty: boolean } } }): boolean {
  return view.state.selection.empty && view.state.selection.$from.parentOffset === 0;
}
function caretAtEnd(view: {
  state: { selection: { empty: boolean; $from: { parentOffset: number; parent: { content: { size: number } } } } };
}): boolean {
  const { $from, empty } = view.state.selection;
  return empty && $from.parentOffset === $from.parent.content.size;
}
function splitAtCaret(
  view: { state: { doc: { textBetween(a: number, b: number): string }; selection: { from: number }; } },
  fullMarkdown: string,
): { before: string; after: string } {
  // 近似：以纯文本 caret 位置切分。富格式跨切点的场景 MVP 容忍降级为纯文本切分。
  const pos = view.state.selection.from;
  const plainBefore = view.state.doc.textBetween(0, pos);
  const idx = fullMarkdown.length && plainBefore.length <= fullMarkdown.length ? plainBefore.length : fullMarkdown.length;
  return { before: fullMarkdown.slice(0, idx), after: fullMarkdown.slice(idx) };
}
```

> 注：`splitAtCaret` 的 markdown 偏移在含标记符（`**`、`==`）时是近似值；MVP 接受「切分点落在纯文本坐标」的降级。若后续要精确，改为在 TipTap 文档内 `splitBlock` 再各自 `getMarkdown`——列为已知改进点，不阻塞 MVP。

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误（如 lint 报 `view`/`editor` 结构类型繁琐，可将上述精细结构类型替换为项目约定的 `EditorView`/`Editor` 导入类型）。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/NodeEditor.tsx
git commit -m "feat(outline): 聚焦节点 TipTap 内联编辑器 + 键盘拦截"
```

---

## Task 9: 单节点行（OutlineNode.tsx）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/OutlineNode.tsx`

**Interfaces:**
- Consumes: `renderInlineMarkdown`（Task 6）、`MarkdownRenderer`（`lib/markdown/renderer`）、`NodeEditor`（Task 8）、`OIcon`（`components/outlineIcons`）、`OutlineNode` 类型
- Produces:
```ts
interface OutlineNodeRowProps {
  node: OutlineNode;
  depth: number;
  focusedId: string | null;
  editingNote: boolean;
  onFocusTitle(id: string, caret?: "start" | "end"): void;
  onToggleCollapse(id: string): void;
  handlers: NodeTitleHandlers;      // 见下，转发给 NodeEditor
  onEditNote(id: string): void;
  onNoteChange(id: string, md: string): void;
  onNoteBlur(id: string, md: string): void;
  onDragStart(id: string): void;
  onDropOn(id: string, position: "before" | "child"): void;
}
// NodeTitleHandlers 携带某节点的 onChange/onEnter/onIndent/... 已绑定 id 的回调集合
```

- [ ] **Step 1: 实现 OutlineNode.tsx**

Create `apps/desktop/src/renderer/features/outline/OutlineNode.tsx`:
```tsx
import { useState } from "react";
import { OIcon } from "../../components/outlineIcons";
import MarkdownRenderer, { renderInlineMarkdown } from "../../lib/markdown/renderer";
import NodeEditor from "./NodeEditor";
import type { OutlineNode } from "./types";

export interface NodeTitleHandlers {
  onChange: (md: string) => void;
  onEnter: (before: string, after: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMergeBackspace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onBlur: (md: string) => void;
}

export interface OutlineNodeRowProps {
  node: OutlineNode;
  depth: number;
  focused: boolean;
  caret: "start" | "end";
  editingNote: boolean;
  onFocusTitle: (id: string, caret?: "start" | "end") => void;
  onToggleCollapse: (id: string) => void;
  handlers: NodeTitleHandlers;
  onEditNote: (id: string) => void;
  onNoteChange: (id: string, md: string) => void;
  onNoteBlur: (id: string, md: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string, position: "before" | "child") => void;
}

export default function OutlineNodeRow(props: OutlineNodeRowProps): React.ReactElement {
  const { node, depth, focused, editingNote } = props;
  const [dropHint, setDropHint] = useState<"before" | "child" | null>(null);
  const hasChildren = node.children.length > 0;

  return (
    <div
      className="ol-row"
      style={{ paddingLeft: depth * 22 }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(node.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        // 上半 → before，下半 → child（缩进为其子）
        const r = e.currentTarget.getBoundingClientRect();
        setDropHint(e.clientY - r.top < r.height / 2 ? "before" : "child");
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropHint) props.onDropOn(node.id, dropHint);
        setDropHint(null);
      }}
      data-drop={dropHint ?? undefined}
    >
      <div className="ol-row-main">
        <button
          className="ol-caret"
          aria-label={node.collapsed ? "展开" : "折叠"}
          onClick={() => props.onToggleCollapse(node.id)}
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          <OIcon name={node.collapsed ? "collapsed" : "caretUp"} size={14} />
        </button>
        <span className={`ol-bullet ${node.collapsed && hasChildren ? "has-hidden" : ""}`} />
        {focused ? (
          <NodeEditor
            initialMarkdown={node.text}
            autoFocusCaret={props.caret}
            onChange={props.handlers.onChange}
            onEnter={props.handlers.onEnter}
            onIndent={props.handlers.onIndent}
            onOutdent={props.handlers.onOutdent}
            onMergeBackspace={props.handlers.onMergeBackspace}
            onMoveUp={props.handlers.onMoveUp}
            onMoveDown={props.handlers.onMoveDown}
            onToggleCollapse={props.handlers.onToggleCollapse}
            onFocusPrev={props.handlers.onFocusPrev}
            onFocusNext={props.handlers.onFocusNext}
            onBlur={props.handlers.onBlur}
          />
        ) : (
          <div
            className="ol-title"
            onClick={() => props.onFocusTitle(node.id, "end")}
            dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(node.text) || "&nbsp;" }}
          />
        )}
      </div>

      {node.note !== undefined && (
        editingNote ? (
          <textarea
            className="ol-note-edit"
            autoFocus
            defaultValue={node.note}
            onChange={(e) => props.onNoteChange(node.id, e.target.value)}
            onBlur={(e) => props.onNoteBlur(node.id, e.target.value)}
          />
        ) : (
          <div className="ol-note" onClick={() => props.onEditNote(node.id)}>
            <MarkdownRenderer content={node.note || "（空备注）"} breaks />
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/OutlineNode.tsx
git commit -m "feat(outline): 单节点行（折叠/项目符号/标题/备注/拖拽落点）"
```

---

## Task 10: 树与键盘编排（OutlineTree.tsx）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/OutlineTree.tsx`

**Interfaces:**
- Consumes: `OutlineNodeRow`（Task 9）、`outlineOps.*`（Task 3/4）、`visibleNodesInOrder`
- Produces:
```ts
interface OutlineTreeProps {
  root: OutlineNode[];
  onChange(next: OutlineNode[], opts?: { immediate?: boolean }): void; // immediate=结构操作即时提交
  makeId(): string;   // 由父层注入（Date.now/Math.random）
}
export default function OutlineTree(props: OutlineTreeProps): React.ReactElement
```

- [ ] **Step 1: 实现 OutlineTree.tsx**

Create `apps/desktop/src/renderer/features/outline/OutlineTree.tsx`:
```tsx
import { useRef, useState } from "react";
import OutlineNodeRow, { type NodeTitleHandlers } from "./OutlineNode";
import type { OutlineNode } from "./types";
import {
  visibleNodesInOrder,
  setText,
  setNote,
  toggleCollapse,
  insertSiblingAfter,
  indent,
  outdent,
  moveUp,
  moveDown,
  mergeDelete,
  dragMove,
  findNode,
} from "./outlineOps";

export interface OutlineTreeProps {
  root: OutlineNode[];
  onChange: (next: OutlineNode[], opts?: { immediate?: boolean }) => void;
  makeId: () => string;
}

const depthOf = (root: OutlineNode[], id: string, d = 0): number => {
  for (const n of root) {
    if (n.id === id) return d;
    const hit = depthOf(n.children, id, d + 1);
    if (hit >= 0) return hit;
  }
  return -1;
};

export default function OutlineTree(props: OutlineTreeProps): React.ReactElement {
  const { root } = props;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [caret, setCaret] = useState<"start" | "end">("end");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const visible = visibleNodesInOrder(root);
  const focusTitle = (id: string, c: "start" | "end" = "end") => {
    setCaret(c);
    setFocusedId(id);
  };
  const focusRelative = (id: string, delta: -1 | 1, c: "start" | "end") => {
    const i = visible.findIndex((n) => n.id === id);
    const target = visible[i + delta];
    if (target) focusTitle(target.id, c);
  };

  const handlersFor = (id: string): NodeTitleHandlers => ({
    onChange: (md) => props.onChange(setText(root, id, md)), // 文本：防抖提交（父层判定）
    onEnter: (before, after) => {
      const newId = props.makeId();
      let next = setText(root, id, before);
      next = insertSiblingAfter(next, id, { id: newId, text: after, collapsed: false, children: [] });
      props.onChange(next, { immediate: true });
      focusTitle(newId, "start");
    },
    onIndent: () => {
      props.onChange(indent(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onOutdent: () => {
      props.onChange(outdent(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onMergeBackspace: () => {
      const r = mergeDelete(root, id);
      props.onChange(r.root, { immediate: true });
      if (r.focusId) focusTitle(r.focusId, "end");
    },
    onMoveUp: () => {
      props.onChange(moveUp(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onMoveDown: () => {
      props.onChange(moveDown(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onToggleCollapse: () => props.onChange(toggleCollapse(root, id), { immediate: true }),
    onFocusPrev: () => focusRelative(id, -1, "end"),
    onFocusNext: () => focusRelative(id, 1, "start"),
    onBlur: (md) => {
      props.onChange(setText(root, id, md), { immediate: true });
      setFocusedId((cur) => (cur === id ? null : cur));
    },
  });

  return (
    <div className="ol-tree">
      {visible.map((node) => (
        <OutlineNodeRow
          key={node.id}
          node={node}
          depth={depthOf(root, node.id)}
          focused={focusedId === node.id}
          caret={caret}
          editingNote={editingNoteId === node.id}
          onFocusTitle={focusTitle}
          onToggleCollapse={(id) => props.onChange(toggleCollapse(root, id), { immediate: true })}
          handlers={handlersFor(node.id)}
          onEditNote={(id) => setEditingNoteId(id)}
          onNoteChange={(id, md) => props.onChange(setNote(root, id, md))}
          onNoteBlur={(id, md) => {
            props.onChange(setNote(root, id, md), { immediate: true });
            setEditingNoteId((cur) => (cur === id ? null : cur));
          }}
          onDragStart={(id) => (dragId.current = id)}
          onDropOn={(targetId, position) => {
            const src = dragId.current;
            dragId.current = null;
            if (!src || src === targetId) return;
            if (position === "child") {
              props.onChange(dragMove(root, src, targetId, 0), { immediate: true });
            } else {
              // before：放到 target 同层、target 之前
              const parentId = parentOf(root, targetId);
              const siblings = parentId ? findNode(root, parentId)!.children : root;
              const idx = siblings.findIndex((n) => n.id === targetId);
              props.onChange(dragMove(root, src, parentId, Math.max(0, idx)), { immediate: true });
            }
          }}
        />
      ))}
      {/* 末尾空白点击 → 在末节点后新建 */}
      <div
        className="ol-tail"
        onClick={() => {
          const last = visible[visible.length - 1];
          const newId = props.makeId();
          const anchor = last ? last.id : null;
          if (anchor) {
            props.onChange(
              insertSiblingAfter(root, anchor, { id: newId, text: "", collapsed: false, children: [] }),
              { immediate: true },
            );
          } else {
            props.onChange([{ id: newId, text: "", collapsed: false, children: [] }], { immediate: true });
          }
          focusTitle(newId, "start");
        }}
      />
    </div>
  );
}

function parentOf(root: OutlineNode[], id: string, parent: string | null = null): string | null {
  for (const n of root) {
    if (n.id === id) return parent;
    const hit = parentOf(n.children, id, n.id);
    if (hit !== undefined && hit !== null) return hit;
    if (n.children.some((c) => c.id === id)) return n.id;
  }
  return null;
}
```

> 注：`parentOf` 顶层节点返回 `null`（与 `dragMove` 的 `targetParentId=null` 语义一致）。

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/OutlineTree.tsx
git commit -m "feat(outline): 树渲染 + 键盘编排 + HTML5 拖拽落点"
```

---

## Task 11: 源码模式（SourceMode.tsx）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/SourceMode.tsx`

**Interfaces:**
- Consumes: `toMarkdown`/`parseMarkdown`（Task 5）、`OutlineNode`
- Produces:
```ts
interface SourceModeProps {
  root: OutlineNode[];
  onApply(next: OutlineNode[]): void;  // 解析成功后回写（重建 id，折叠重置）
  onCancel(): void;
}
export default function SourceMode(props: SourceModeProps): React.ReactElement
```

- [ ] **Step 1: 实现 SourceMode.tsx**

Create `apps/desktop/src/renderer/features/outline/SourceMode.tsx`:
```tsx
import { useState } from "react";
import { toMarkdown, parseMarkdown } from "./outlineSerialize";
import type { OutlineNode } from "./types";

export interface SourceModeProps {
  root: OutlineNode[];
  onApply: (next: OutlineNode[]) => void;
  onCancel: () => void;
}

export default function SourceMode(props: SourceModeProps): React.ReactElement {
  const [text, setText] = useState(() => toMarkdown(props.root));
  const [err, setErr] = useState<string | null>(null);

  const apply = () => {
    try {
      const parsed = parseMarkdown(text);
      setErr(null);
      props.onApply(parsed);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="ol-source">
      <div className="ol-source-bar">
        <span className="ol-source-hint">源码模式：往返会重建节点、折叠状态重置为全展开</span>
        <button onClick={apply}>应用并返回大纲</button>
        <button onClick={props.onCancel}>取消</button>
      </div>
      {err && <div className="ol-source-err">解析失败：{err}</div>}
      <textarea
        className="ol-source-area"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/SourceMode.tsx
git commit -m "feat(outline): markdown 源码模式（往返解析）"
```

---

## Task 12: 导出对话框（ExportDialog.tsx）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/ExportDialog.tsx`

**Interfaces:**
- Consumes: `useElectronAPI`（`api.collections.list(profileId)`、`api.documents.create({ profileId, title, text, collectionId, parentDocumentId? })`）、`useUIStore`（`activeProfileId`）、`useNavigate`、`toExportMarkdown`（Task 5）、`OutlineDoc`
- Produces:
```ts
interface ExportDialogProps {
  doc: OutlineDoc;
  onClose(): void;
}
export default function ExportDialog(props: ExportDialogProps): React.ReactElement
```

- [ ] **Step 1: 确认 preload 暴露 documents.create**

Run: `grep -n "documents" apps/desktop/src/preload/index.ts | grep -i create`
Expected: 存在 `create: (payload) => ipcRenderer.invoke("documents:create", ...)`。若缺失，在 preload 的 `documents` 对象补：
```ts
create: (payload) => ipcRenderer.invoke("documents:create", payload),
```
并在其 TS 接口加 `create: (payload: unknown) => Promise<unknown>;`（handler `documents:create` 已存在于 `main/ipc/handlers/documents.ts`）。

- [ ] **Step 2: 实现 ExportDialog.tsx**

Create `apps/desktop/src/renderer/features/outline/ExportDialog.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUIStore } from "../../state/uiStore";
import { unwrapIpc } from "../../lib/ipc";
import { toExportMarkdown } from "./outlineSerialize";
import type { OutlineDoc } from "./types";

interface Collection {
  id: string;
  name: string;
}

export interface ExportDialogProps {
  doc: OutlineDoc;
  onClose: () => void;
}

export default function ExportDialog(props: ExportDialogProps): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const profileId = useUIStore((s) => s.activeProfileId);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    void (async () => {
      try {
        const res = await unwrapIpc<{ data?: Collection[] }>(api.collections.list(profileId));
        const list = (res as { data?: Collection[] }).data ?? (res as unknown as Collection[]);
        setCollections(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list[0]) setCollectionId(list[0].id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [api, profileId]);

  const doExport = async () => {
    if (!profileId || !collectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await unwrapIpc<{ data?: { id: string } }>(
        api.documents.create({
          profileId,
          title: props.doc.title,
          text: toExportMarkdown(props.doc),
          collectionId,
        }),
      );
      const id = (res as { data?: { id: string } }).data?.id;
      props.onClose();
      if (id) navigate(`/document/${id}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="ol-modal-backdrop" onClick={props.onClose}>
      <div className="ol-modal" onClick={(e) => e.stopPropagation()}>
        <h3>导出为 Outline 文档</h3>
        <label>目标集合</label>
        <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {error && <div className="ol-modal-err">{error}</div>}
        <div className="ol-modal-actions">
          <button onClick={props.onClose}>取消</button>
          <button disabled={busy || !collectionId} onClick={doExport}>
            {busy ? "导出中…" : "导出并打开"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误。若 `api.documents.create` / `api.collections.list` 的 TS 类型不匹配，按 preload 的实际签名调整（用 `unknown` 载荷 + `unwrapIpc` 解包）。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/ExportDialog.tsx apps/desktop/src/preload/index.ts
git commit -m "feat(outline): 导出对话框（选集合 → documents.create → 打开）"
```

---

## Task 13: 路由页与提交编排（OutlineView.tsx + CSS）

**Files:**
- Create: `apps/desktop/src/renderer/features/outline/OutlineView.tsx`
- Create: `apps/desktop/src/renderer/features/outline/OutlineView.css`

**Interfaces:**
- Consumes: `useOutlines`（Task 7）、`OutlineTree`（Task 10）、`SourceMode`（Task 11）、`ExportDialog`（Task 12）、`makeNodeId`
- Produces: `export default function OutlineView(): React.ReactElement`（路由 `/outline`）

编排要点：
- 左列：大纲文档列表（新建/选择/重命名/删除/置顶）。
- 右列：工具栏（标题、大纲/源码切换、导出按钮）+ 树或源码。
- 文本类 `onChange`（非 `immediate`）走 **800ms 防抖** 后 `updateNodes`；结构类（`immediate: true`）立即 `updateNodes`。
- 空态：无文档时提示新建。

- [ ] **Step 1: 实现 OutlineView.tsx**

Create `apps/desktop/src/renderer/features/outline/OutlineView.tsx`:
```tsx
import { useMemo, useRef, useState } from "react";
import { useOutlines } from "./useOutlines";
import OutlineTree from "./OutlineTree";
import SourceMode from "./SourceMode";
import ExportDialog from "./ExportDialog";
import { makeNodeId } from "./types";
import type { OutlineNode, OutlineDoc } from "./types";
import "./OutlineView.css";

export default function OutlineView(): React.ReactElement {
  const store = useOutlines();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active: OutlineDoc | null = useMemo(
    () => store.outlines.find((d) => d.id === activeId) ?? store.outlines[0] ?? null,
    [store.outlines, activeId],
  );

  const commitNodes = (docId: string, next: OutlineNode[], immediate?: boolean) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) {
      void store.updateNodes(docId, () => next);
    } else {
      debounceRef.current = setTimeout(() => void store.updateNodes(docId, () => next), 800);
    }
  };

  if (store.loading && store.outlines.length === 0) {
    return <div className="ol-view ol-empty">正在加载大纲…</div>;
  }

  return (
    <div className="ol-view">
      <aside className="ol-doclist">
        <div className="ol-doclist-head">
          <span>大纲</span>
          <button
            onClick={async () => {
              const id = await store.addDoc("未命名大纲");
              setActiveId(id);
              setSourceMode(false);
            }}
          >
            ＋新建
          </button>
        </div>
        {store.outlines.map((d) => (
          <div
            key={d.id}
            className={`ol-doc-item ${active?.id === d.id ? "active" : ""}`}
            onClick={() => {
              setActiveId(d.id);
              setSourceMode(false);
            }}
          >
            <span className="ol-doc-title">{d.title}</span>
            <button
              className="ol-doc-del"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                void store.removeDoc(d.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {store.outlines.length === 0 && <div className="ol-empty">还没有大纲，点「新建」开始。</div>}
      </aside>

      <main className="ol-main">
        {!active ? (
          <div className="ol-empty">选择或新建一份大纲</div>
        ) : (
          <>
            <div className="ol-toolbar">
              <input
                className="ol-doc-name"
                value={active.title}
                onChange={(e) => void store.renameDoc(active.id, e.target.value)}
              />
              <div className="ol-toolbar-actions">
                <button className={sourceMode ? "" : "active"} onClick={() => setSourceMode(false)}>
                  大纲
                </button>
                <button className={sourceMode ? "active" : ""} onClick={() => setSourceMode(true)}>
                  源码
                </button>
                <button onClick={() => setExporting(true)}>导出到 Outline</button>
              </div>
            </div>

            {sourceMode ? (
              <SourceMode
                root={active.root}
                onApply={(next) => {
                  void store.updateNodes(active.id, () => next);
                  setSourceMode(false);
                }}
                onCancel={() => setSourceMode(false)}
              />
            ) : (
              <OutlineTree
                key={active.id}
                root={active.root}
                makeId={() => makeNodeId(Date.now(), Math.random())}
                onChange={(next, opts) => commitNodes(active.id, next, opts?.immediate)}
              />
            )}
          </>
        )}
      </main>

      {exporting && active && <ExportDialog doc={active} onClose={() => setExporting(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: 实现 OutlineView.css**

Create `apps/desktop/src/renderer/features/outline/OutlineView.css`。要求（用项目现有 CSS 变量 `--color-*`，适配明暗）：
```css
.ol-view { display: flex; height: 100%; overflow: hidden; }
.ol-doclist { width: 220px; border-right: 1px solid var(--color-border); overflow-y: auto; flex-shrink: 0; }
.ol-doclist-head { display: flex; justify-content: space-between; align-items: center; padding: 12px; font-weight: 600; }
.ol-doc-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; cursor: pointer; }
.ol-doc-item.active { background: var(--color-bg-secondary, rgba(127,127,127,0.12)); }
.ol-doc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-doc-del { opacity: 0; border: none; background: none; cursor: pointer; color: var(--color-text-secondary); }
.ol-doc-item:hover .ol-doc-del { opacity: 1; }
.ol-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.ol-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); }
.ol-doc-name { flex: 1; font-size: 20px; font-weight: 700; border: none; background: none; color: var(--color-text); outline: none; }
.ol-toolbar-actions { display: flex; gap: 8px; }
.ol-toolbar-actions button.active { font-weight: 700; }
.ol-tree { flex: 1; overflow-y: auto; padding: 16px 20px; }
.ol-row { position: relative; }
.ol-row-main { display: flex; align-items: flex-start; gap: 4px; line-height: 1.6; }
.ol-caret { border: none; background: none; cursor: pointer; color: var(--color-text-secondary); padding: 2px; }
.ol-bullet { width: 6px; height: 6px; margin: 9px 6px 0 0; border-radius: 50%; background: var(--color-text-secondary); flex-shrink: 0; }
.ol-bullet.has-hidden { box-shadow: 0 0 0 4px var(--color-bg-secondary, rgba(127,127,127,0.2)); }
.ol-title, .ol-node-editor { flex: 1; min-width: 0; }
.ol-title { cursor: text; }
.ol-note { margin: 2px 0 6px 20px; font-size: 13px; color: var(--color-text-secondary); cursor: text; }
.ol-note-edit { width: 100%; min-height: 60px; margin: 2px 0 6px 20px; font: inherit; }
.ol-row[data-drop="before"] { box-shadow: inset 0 2px 0 var(--color-primary, #4c6ef5); }
.ol-row[data-drop="child"] { box-shadow: inset 0 -2px 0 var(--color-primary, #4c6ef5); }
.ol-tail { height: 40px; cursor: text; }
.ol-source { flex: 1; display: flex; flex-direction: column; }
.ol-source-bar { display: flex; gap: 8px; align-items: center; padding: 8px 20px; }
.ol-source-hint { flex: 1; font-size: 12px; color: var(--color-text-secondary); }
.ol-source-err { padding: 4px 20px; color: #e03131; font-size: 13px; }
.ol-source-area { flex: 1; width: 100%; font-family: var(--font-mono, monospace); font-size: 13px; padding: 16px 20px; border: none; outline: none; resize: none; background: var(--color-bg); color: var(--color-text); }
.ol-empty { padding: 40px; color: var(--color-text-secondary); text-align: center; }
.ol-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.ol-modal { background: var(--color-bg); border-radius: 12px; padding: 24px; width: 360px; display: flex; flex-direction: column; gap: 10px; }
.ol-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ol-modal-err { color: #e03131; font-size: 13px; }
```

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 无新错误。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/features/outline/OutlineView.tsx apps/desktop/src/renderer/features/outline/OutlineView.css
git commit -m "feat(outline): 大纲路由页（文档列表/工具栏/树·源码切换/导出/防抖提交）"
```

---

## Task 14: 接入路由与侧边栏

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/renderer/components/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `OutlineView`（Task 13）
- Produces: 可从侧边栏进入 `/outline`

- [ ] **Step 1: 加路由**

在 `App.tsx` 顶部 import 区（与其它 `features/*/*View` 并列）加：
```tsx
import OutlineView from "./features/outline/OutlineView";
```
在 `<Route path="/notes" .../>` 附近加：
```tsx
<Route path="/outline" element={<OutlineView />} />
```

- [ ] **Step 2: 加侧边栏入口**

在 `Sidebar.tsx` 中 `navItem("/notes", "随记", …)` 一行附近加：
```tsx
{navItem("/outline", "大纲", <OIcon name="toc" size={20} />, true)}
```
（`toc` 图标已存在于 `OUTLINE_ICONS`；如视觉不佳可换 `bulletList` 或 `document`。确认 `OIcon` 已在该文件 import。）

- [ ] **Step 3: typecheck + lint + 构建冒烟**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/components/sidebar/Sidebar.tsx
git commit -m "feat(outline): 接入 /outline 路由与侧边栏入口"
```

---

## Task 15: 端到端验证 + 变更记录

**Files:**
- Modify: `CHANGELOG.md`（仓库根）

**Interfaces:**
- Consumes: 全部前置任务

- [ ] **Step 1: 全量测试 + 类型 + lint**

Run（`apps/desktop/`）: `npm test && npm run typecheck && npm run lint`
Expected: 测试全绿、无类型/lint 错误。

- [ ] **Step 2: 启动应用手工验证**

Run（仓库根）: `npm run dev`
逐项确认：
1. 侧边栏出现「大纲」，点击进入 `/outline`。
2. 新建大纲 → 输入标题；在节点里输入 `**加粗** 与 ==高亮==`，失焦后渲染出加粗与高亮。
3. Enter 建兄弟、Tab/Shift+Tab 升降级、Alt+↑/↓ 移动、Cmd/Ctrl+. 折叠、行首 Backspace 合并、↑/↓ 跨节点移动焦点。
4. 给某节点点开备注区，写多行；失焦渲染。
5. 拖拽一个节点到另一节点上半（before）/下半（child），落点正确。
6. 切「源码」看到嵌套 `- ` markdown，改一行 → 应用 → 大纲更新。
7. 「导出到 Outline」选集合 → 导出 → 自动跳转到新建文档，内容为嵌套列表 + 备注。
8. 关闭重开应用，大纲仍在（WebDAV/localStorage 持久化）。

（可选，若配置了 CDP：用既有 remote-debugging-port 往返方法自动化核对上述 2/3/6，见 [[cdp-e2e-verification]]。）

- [ ] **Step 3: 写 CHANGELOG**

在 `CHANGELOG.md` 顶部加（版本号取当前 `package.json` version 的下一个 minor，落地时确认）：
```markdown
## [1.9.0] - 2026-07-26
### Features
- 新增「大纲」功能（幕布式）：可折叠项目符号树、节点内联 markdown 所见即所得、节点备注、拖拽重排、markdown 源码模式、一键导出为 Outline 文档。数据存 WebDAV 私有单文件 `大纲/<userId>.json`。
### Design Rationale
- 编辑器采用「React 自管树 + 仅聚焦节点挂 TipTap 内联编辑器」（方案 B）：折叠/拖拽/键盘/备注等树逻辑纯前端可控，只有聚焦节点用 TipTap 做所见即所得，兼顾体验与性能。
- 持久化复用 `useWebdavStore`，合并粒度为「单份大纲」（按 updatedAt 后写胜），与随记/待办一致。
### Notes & Caveats
- 源码模式往返会重建节点 id，导致折叠状态重置为全展开；树视图内日常编辑不受影响。
- 节点内 Enter 切分点在含 markdown 标记符时为近似（按纯文本坐标），MVP 容忍。
- 拖拽用原生 HTML5 DnD；源码用原生 textarea，均未引入新依赖。
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 记录大纲笔记功能 v1.9.0"
```

- [ ] **Step 5: 版本号**

将 `package.json`（仓库根与/或 `apps/desktop/`）version 提到 `1.9.0`（与 CHANGELOG 一致；确认项目发布约定后再改）。
```bash
git add package.json apps/desktop/package.json
git commit -m "chore: 版本号提升至 1.9.0"
```

---

## Self-Review 记录

- **Spec 覆盖**：数据模型(§3)→Task2/7；模块结构(§4)→Task2–13；编辑器交互方案 B(§5)→Task6/8/9/10；备注(§7)→Task9/10；源码模式(§8)→Task5/11；导出(§9)→Task5/12；接入(§10)→Task14；错误处理(§11)→useWebdavStore 兜底 + SourceMode/Export 内联报错；测试(§12)→Task1/3/4/5 纯函数单测 + Task15 手工/CDP；版本记录(§13)→Task15。无遗漏。
- **占位扫描**：无 TBD/TODO/"类似上文"；纯函数步骤均给完整代码与断言。组件步骤给完整代码，并注明 UI 类以 typecheck/lint + CDP 为门槛（无 DOM 测试基建，属项目现状而非占位）。
- **类型一致**：`OutlineNode`/`OutlineDoc` 字段跨任务一致；`mergeDelete` 返回 `MergeResult`；`dragMove(root,id,targetParentId,index)`、`indent/outdent/moveUp/moveDown` 签名在 Task4 定义、Task10 按同名调用；`updateNodes(docId, mutate)` 在 Task7 定义、Task13 调用；`renderInlineMarkdown` 在 Task6 定义、Task9 使用。
- **已知改进点（不阻塞 MVP）**：Enter 切分精度、源码往返折叠态、拖拽仅原生 DnD——均已在 CHANGELOG Notes 标注。
