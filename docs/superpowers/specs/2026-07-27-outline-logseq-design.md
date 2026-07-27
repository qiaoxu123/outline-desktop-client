# Logseq 式块大纲笔记 — 设计文档

- 日期：2026-07-27
- 版本目标：首版 MVP（取代 v1.14.0 自造大纲模块）
- 目的：参考开源 Logseq，做一个**块式大纲编辑器**，用于论文撰写前的思路整理。核心是流畅的键盘流大纲编辑 + 折叠 + zoom 聚焦 + 拖拽，且**能正常粘贴幕布/Logseq/大纲等外部多层内容**。

## 1. 背景与决策

前两版的教训：
- v1.14.0 自造 NodeEditor（单段落 TipTap schema）→ 无法粘贴幕布多层内容，体验差。
- v1.15.0 在 Outline 文档编辑器上加折叠 → 用户放弃"直接基于 Outline 文档"的方向。

本版经 brainstorm 明确：
- **范围**：只做块式大纲编辑器（Logseq 核心手感）。不做双向链接 / 每日日志 / 图谱。
- **块渲染模型**：Logseq 原生——聚焦某块显示**原始 markdown**（能看到 `**`、`[]()` 等标记），失焦即 markdown-it 渲染。→ 编辑即纯文本 textarea，实现简洁、粘贴天然可用（这是关键）。
- **存储**：WebDAV 同步单文件（像随记），多设备可用。
- **Zoom、拖拽**：均进首版。

复用：v1.14.0 的 `outlineOps.ts`（纯树变换）、`outlineSerialize.ts`（树↔嵌套 markdown）、`useOutlines.ts`（WebDAV store hook）、`types.ts` 可大幅复用，仅按 Block/Page 语义微调（去掉 `note` 字段）。

## 2. 范围

必做：块树编辑（Enter 新块 / Tab 升降级 / 折叠）、块级 Logseq 原生编辑（聚焦原始 md、失焦渲染）、多行/带缩进**粘贴解析成块子树**、zoom 聚焦、拖拽重排、多页管理、WebDAV 同步。

不做（后续）：双向链接 `[[]]`、块引用、每日日志、图谱、查询、导出到 Outline 文档。

## 3. 数据与存储

WebDAV 私有单文件 **`大纲笔记/<userId>.json`**（复用 `useWebdavStore`，`itemsKey:"pages"`，version 1，cache key `outline2.cache.<userId>.v1`）。用**新路径 `大纲笔记/`** 而非旧 `大纲/`，彻底隔离 v1.14.0 的实验数据（旧文件保留但本版忽略，不做迁移）：

```ts
export const OUTLINE_VERSION = 1;

export interface Block {
  id: string;
  text: string;          // 原始 markdown（单块可含软换行 \n）
  collapsed: boolean;    // 折叠状态，持久化（Logseq 折叠是持久的）
  children: Block[];
}

export interface Page {  // 满足 StoreItem: {id, updatedAt, deletedAt}
  id: string;
  title: string;
  root: Block[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  pinned?: boolean;
}

export interface OutlineFile { version: number; pages: Page[]; }
```

- 一个文件装多页；多设备合并粒度 = 单页（`useWebdavStore` 按 id 合并、updatedAt 后写胜）。
- 每页可与嵌套 `- ` markdown 双向互转（`outlineSerialize`，用于粘贴与未来导出）。
- v1.14.0 的 `大纲/<userId>.json`（itemsKey "outlines"、节点含 note）与本版数据模型不同；本版走**新路径 + 新 itemsKey**，与旧数据完全隔离、不迁移（旧属实验数据）。

## 4. 模块结构

复用/改造既有 `features/outline/`：

| 文件 | 处置 |
|---|---|
| `types.ts` | 改：`Block`（去 note）/`Page`/`OutlineFile`；路径 `大纲笔记/<userId>.json`、cache key、`makeBlockId`、`emptyBlock` |
| `outlineOps.ts` | 复用：泛型化到 `Block[]`；去掉 `setNote`；其余 indent/outdent/move/merge/insert/dragMove/toggleCollapse/visibleNodesInOrder 保留（已单测） |
| `outlineSerialize.ts` | 改：树↔嵌套 markdown，**去掉 note 续写段落逻辑**；新增/强化 `parsePastedOutline(text)`（把带缩进/`- `的粘贴文本解析成 `Block[]`） |
| `useOutlines.ts` → `usePages.ts` | 改：`pages` 语义；`addPage/renamePage/removePage/togglePin/updateBlocks(pageId, mutate)` |
| `BlockRow.tsx`（新，替代 OutlineNode） | 单块行：圆点 + 折叠三角 + 标题（聚焦=textarea 原始 md / 失焦=markdown-it 渲染）；圆点点击 zoom；拖拽落点 |
| `BlockTree.tsx`（新，替代 OutlineTree） | 渲染可见块、键盘编排、拖拽、粘贴分发；支持 zoom 根 |
| `OutlineView.tsx` | 改：左页面列表 + 右块树 + zoom 面包屑 + 乐观本地 root/flush（沿用 v1.14.0 已修的乐观提交模式） |
| `OutlineView.css` | 改：Logseq 观感（圆点/折叠三角/缩进/zoom 面包屑） |
| `NodeEditor.tsx` | **删**（TipTap 单块编辑器，不再需要） |
| `ExportDialog.tsx` | **删**（本版不导出到 Outline） |
| `SourceMode.tsx` | **删**（块本身即 markdown，无需独立源码模式） |
| `__tests__/*` | 改：保留 outlineOps/outlineSerialize 测试并按新类型调整；新增 `parsePastedOutline` 测试 |

依赖：移除 `@tiptap/extension-document`（仅旧 NodeEditor 用）。保留 vitest。

接入：路由 `/outline` 与侧边栏「大纲」入口沿用（已在）。

## 5. 块编辑器（Logseq 原生手感）

- **失焦块**：`<MarkdownRenderer content={block.text} breaks />`（复用 `lib/markdown`）。加粗 / ==高亮== / 链接 / 行内公式均出效果。
- **聚焦块**：换成一个自适应高度 `<textarea>`，`value=block.text`，直接编辑原始 markdown。
- **圆点**：小圆点；hover 显现折叠三角（有子块时）；点圆点 = zoom 聚焦该块；折叠圆点带灰晕。
- **键盘流**（在聚焦 textarea 内拦截，动作转成 `outlineOps` 纯树变换）：

| 按键 | 行为 |
|---|---|
| Enter | 光标处切分：后半成为新兄弟块并聚焦（首） |
| Shift+Enter | 块内软换行（插入 `\n`，不新建块） |
| Tab / Shift+Tab | 升 / 降级 |
| 行首 Backspace | 并入上一可见块末尾 |
| Alt+↑ / Alt+↓ | 上下移动块 |
| Cmd/Ctrl+. | 折叠 / 展开当前块 |
| ↑ / ↓ 到文本边界 | 焦点移到上/下一可见块 |

## 6. 粘贴（重点，历史痛点）

聚焦块 textarea 的 `onPaste`：
- 读取剪贴板 `text/plain`（多层大纲工具通常提供带缩进的纯文本；幕布/Logseq 亦提供 `text/html` 嵌套 `<ul>`——MVP 先走 plain 文本缩进解析，覆盖绝大多数场景）。
- **单行** → 交给 textarea 默认插入。
- **多行/带缩进** → `parsePastedOutline(text)` 解析：按前导 tab（或每 2/4 空格）判定层级，行首可选 `- `/`* `/`• ` 去除，得到 `Block[]`；在当前块光标处切分并把这些块插入为对应层级的兄弟/子块。→ 从幕布复制的大纲粘成正确多层块。
- `parsePastedOutline` 为纯函数，vitest 覆盖：tab 缩进、空格缩进、带/不带 bullet、混合。

## 7. Zoom 聚焦

- 点某块圆点 → 视图根切到该块：只渲染该块子树，顶部面包屑（页标题 › … › 当前块摘要）可逐级点回。
- `zoomedBlockId` 存 OutlineView 局部 state；BlockTree 接收 `rootBlockId?`，为空则渲染整页。
- 面包屑各级可点击跳到对应祖先或回整页。

## 8. 拖拽

- 块行 HTML5 DnD：上半→之前同层，下半→成为其子块；复用 `outlineOps.dragMove`（含"禁止拖入自身子树"守卫 + before 落点索引补偿，均 v1.14.0 已修）。

## 9. 提交与数据安全

- 沿用 v1.14.0 已修的**乐观本地 root（draft）+ pending flush**（`useWebdavStore.commit` 在 PUT 后才 setItems，直接基于滞后 store 会覆盖丢失）：OutlineView 持本地 draft 同步更新，结构操作即时提交、文本输入防抖提交、切页/卸载 flush。
- 文本输入防抖 ~600–800ms；结构操作（Enter/Tab/move/merge/fold/drag/粘贴）即时提交。

## 10. 错误处理

- WebDAV 读写失败由 `useWebdavStore` 兜底（error 态 + localStorage 镜像即时上屏）。
- 空态：无页面时引导新建；空页给一个空块可直接输入。

## 11. 测试

- 纯函数 vitest：`outlineOps`（复用既有，调整类型）、`outlineSerialize` 往返、`parsePastedOutline`（各种缩进/bullet）。
- 编辑器/键盘/粘贴/zoom/拖拽交互：typecheck + 构建 + 真机（CDP/手工）验证——**粘贴幕布内容为关键验收项**。

## 12. 版本与变更

CHANGELOG 记 v1.16.0：以 Logseq 式块大纲取代 v1.14.0 自造模块；块级原生编辑 + 粘贴解析 + zoom + 拖拽 + WebDAV 同步。apps/desktop 版本 → 1.16.0。

Caveat：块渲染为"聚焦原始 md / 失焦渲染"（Logseq 原生，编辑时可见标记，符合本次明确选择）；折叠状态持久化；MVP 粘贴走 plain-text 缩进解析（幕布/Logseq 的富 HTML 嵌套后续可增强）。
