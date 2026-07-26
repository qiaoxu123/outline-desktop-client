# 大纲笔记（Outline / 幕布式）— 设计文档

- 日期：2026-07-26
- 版本目标：首版 MVP
- 目的：提供类似幕布（Mubu）的大纲笔记，供**论文撰写前的思路整理**——可折叠的项目符号树、内联 markdown、节点备注，整理完可一键导出为 Outline 正式文档。

## 1. 背景与定位

应用已有成熟的 feature 化架构（`features/*`）、HashRouter 路由、Zustand（`uiStore`）、react-query，以及两套复用基建：

- `useWebdavStore`（`hooks/useWebdavStore.ts`）：泛型「每用户 WebDAV 私有 JSON 单文件」存储，带 localStorage 镜像、多设备安全写（re-GET → merge-by-id → apply → PUT）、软删 + 30 天清理。随记（随记/<userId>.json）与待办已复用它。
- 编辑器栈：**TipTap（基于 ProseMirror）+ tiptap-markdown 序列化 + markdown-it 渲染**；`lib/markdown` 内已有内联渲染与 ==高亮== 的 markRule 调优。
- `documents:create` IPC（`main/ipc/handlers/documents.ts`，走 `@outline/api-client` 的 `createDocument`）：用于导出为 Outline 文档。
- 侧边栏 `navItem(path, label, icon, …)` 模式 + `OIcon` 图标组件。

大纲笔记作为**私有本地功能**接入，不污染 Outline 服务器，存储走 WebDAV 私有单文件（与随记同模式）。

## 2. 范围（MVP）

必做：

- 核心树编辑：Enter 建兄弟节点、Tab/Shift+Tab 升降级、折叠/展开。
- 节点内联 markdown 实时所见即所得渲染（加粗、==高亮==、链接等）。
- 整份大纲的 markdown 源码编辑模式（与树互转）。
- 拖拽重排 / 升降层级。
- 节点备注（长文本栏）。
- 导出为 Outline 论文文档。

不做（后续版本）：

- 思维导图（mindmap）视图。

## 3. 数据模型

WebDAV 私有单文件：`大纲/<userId>.json`（复用 `useWebdavStore`）。

- `itemsKey: "outlines"`
- `version: 1`
- `filePath(userId) => "大纲/" + userId + ".json"`
- `cacheKey(userId) => "outline.cache." + userId + ".v1"`

类型：

```ts
export const OUTLINE_VERSION = 1;

export interface OutlineNode {
  id: string;
  text: string;          // 标题行的内联 markdown 源码
  note?: string;         // 备注（长文本，内联/多段 markdown），可选
  collapsed: boolean;    // 折叠状态（仅视图态，不进导出 markdown）
  children: OutlineNode[];
}

export interface OutlineDoc {   // 满足 useWebdavStore 的 StoreItem: {id, updatedAt, deletedAt}
  id: string;
  title: string;
  root: OutlineNode[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  pinned?: boolean;
}

export interface OutlineFile {
  version: number;
  outlines: OutlineDoc[];
}
```

设计要点：

- 一个文件装**多份大纲**（`outlines: OutlineDoc[]`）。
- 多设备合并粒度 = **单份大纲**：`useWebdavStore` 按 `id` 合并、同 id 取 `updatedAt` 较新者（整份文档后写胜）。节点级不做细粒度合并——单人编辑场景足够，避免复杂度。
- 节点树整棵随文档一起重写；节点内编辑走本地实时 setState，失焦/切换节点/切换文档时 `commit`（并对连续输入做防抖 commit）。
- `collapsed` 是视图态，只存 JSON，不出现在导出/源码 markdown 中。

## 4. 模块结构（对齐 `features/notes`）

```
features/outline/
  OutlineView.tsx      // 路由 /outline：左=大纲文档列表侧栏，右=树编辑区 + 工具栏
  OutlineTree.tsx      // 渲染节点树、折叠、拖拽（dnd）
  OutlineNode.tsx      // 单行：项目符号 + 折叠三角 + 标题(聚焦=TipTap/失焦=markdown-it) + 备注
  NodeEditor.tsx       // 仅「当前聚焦节点」挂载的 TipTap 内联编辑器
  SourceMode.tsx       // 整份大纲的 markdown <textarea> 源码编辑
  ExportDialog.tsx     // 选目标集合/父文档并导出为 Outline 文档
  useOutlines.ts       // 包 useWebdavStore：文档级 CRUD + 节点操作分发
  outlineOps.ts        // 纯函数不可变树变换（见 §6）
  outlineSerialize.ts  // 树 ↔ 嵌套 markdown；导出用 markdown 生成
  types.ts             // 上述类型 + filePath / cacheKey
  OutlineView.css
```

各单元职责边界：

- `outlineOps.ts`：**纯函数**，输入 `OutlineNode[]` + 参数，输出新的 `OutlineNode[]`。不碰 React/IO。最易测。
- `outlineSerialize.ts`：**纯函数**，树 ↔ markdown 字符串双向；不碰 React/IO。
- `useOutlines.ts`：唯一与 `useWebdavStore` / IPC 打交道处，向上暴露语义化 API（`addDoc/renameDoc/deleteDoc/updateNodes(docId, mutate)` 等）。
- 视图组件只调 `useOutlines` 与 `outlineOps`，不直接读写存储。

## 5. 编辑器交互（方案 B：React 树 + 聚焦节点 TipTap）

- **失焦节点标题**：用 markdown-it 内联渲染（复用 `lib/markdown/renderer`）成只读 HTML，加粗 / ==高亮== / 链接均出效果。视觉与 TipTap 渲染一致（同走 markdown-it-mark / strong 等）。
- **聚焦节点标题**：换成一个 TipTap 内联编辑器（`NodeEditor`），扩展仅保留内联能力：Bold / Italic / Code + Highlight + Link + Underline，**禁用块级节点**；初始化用 tiptap-markdown 解析该节点 `text`；失焦时序列化回 markdown 存回节点。所见即所得，编辑时不露 `**`/`==` 标记。
- 同一时刻**只挂载一个** TipTap 实例（聚焦节点），避免大纲变大时多实例性能问题。

键盘流（在聚焦编辑器内拦截，动作转成 `outlineOps` 纯树变换）：

| 按键 | 行为 |
|---|---|
| Enter | 光标处切分：前半留原节点，后半成为新兄弟节点并聚焦（光标置首） |
| Tab | 降级（indent，成为前一兄弟的子节点） |
| Shift+Tab | 升级（outdent） |
| 行首 Backspace | 并入上一个可见节点末尾（mergeDelete） |
| Alt+↑ / Alt+↓ | 在同层上下移动节点 |
| Cmd/Ctrl+. | 折叠 / 展开当前节点 |
| ↑ / ↓ 到文本边界 | 焦点移到上/下一个可见节点 |

拖拽：`OutlineTree` 支持鼠标拖拽节点上下移动、左右改层级，转成 `outlineOps.dragMove(nodeId, targetParentId, index)`。MVP 用 HTML5 DnD 或轻量 dnd 实现，避免引入重依赖（实现阶段确认是否需要 dnd-kit）。

## 6. `outlineOps` 纯树变换清单

全部为不可变变换（返回新 `OutlineNode[]`）：

- `insertSiblingAfter(root, nodeId, newNode)` — Enter 用（含光标切分产出的两段文本由调用方准备）。
- `indent(root, nodeId)` / `outdent(root, nodeId)` — Tab / Shift+Tab。
- `moveUp(root, nodeId)` / `moveDown(root, nodeId)` — Alt+↑/↓。
- `mergeDelete(root, nodeId)` — 行首 Backspace，把当前节点文本并入上一可见节点并删除自身（其子节点上提为上一节点的子节点或原位处理，实现阶段定义清楚并测试）。
- `toggleCollapse(root, nodeId)`。
- `setText(root, nodeId, text)` / `setNote(root, nodeId, note)`。
- `dragMove(root, nodeId, targetParentId, index)`。
- 辅助：`findNode`、`visibleNodesInOrder(root)`（用于焦点上下移动、跳过折叠子树）。

## 7. 备注（节点长文本）

- 标题行下方一段更暗更小的正文块，交互同样「失焦 markdown-it / 聚焦 TipTap」。
- 用途：论文段落草稿。
- 序列化：作为该 bullet 下的**缩进续写段落**（非 bullet 的缩进行），可无损往返（见 §8）。

## 8. 源码模式与序列化

- 工具栏切换：树视图 ↔ 整份 `- ` 嵌套 markdown 的 `<textarea>`（等宽字体；MVP 不引入 CodeMirror，避免新依赖）。
- 切回树视图时 `outlineSerialize.parse` 重新解析成树；**解析失败保留 textarea + 行内报错，不破坏原树**。

序列化规则（`outlineSerialize`）：

- 每个节点 → `- <text>`，按深度用 2 空格缩进。
- 备注 → 该 bullet 下的**缩进续写段落**（缩进对齐到 bullet 文本、非 `- ` 起始）；解析时：紧跟某 bullet、缩进更深且非 bullet 的段落 → 归为该 bullet 的 `note`。
- `collapsed` **不**进 markdown（视图态）。

Caveat（MVP 取舍）：源码模式往返会**重建节点 id**，因此折叠状态会重置为全展开。树视图内的日常编辑不受影响（不经过源码往返，id 与折叠态稳定保留）。此取舍写入 CHANGELOG 的 Notes。

## 9. 导出为 Outline 文档

- 用 `outlineSerialize.toExportMarkdown(doc)` 生成 `# <title>` + 嵌套列表 + 备注段落的完整 markdown。
- `ExportDialog` 选目标集合 / 父文档（复用现有 picker，如随记的 `DocPicker` 或集合选择 UI）。
- 调 `documents:create`（preload `documents.create`）创建文档 → 成功 toast + 一键打开（跳 `/document/:id`）。
- 失败 → toast 报错，不影响本地大纲。

## 10. 接入

- 路由：`App.tsx` 增 `<Route path="/outline" element={<OutlineView />} />`。
- 侧边栏：`navItem("/outline", "大纲", <OIcon name="…" />, true)`，置于 随记/待办 附近；选一个合适的 `OIcon`（如列表树类图标），缺失则补一枚。

## 11. 错误处理

- WebDAV 读写失败：由 `useWebdavStore` 兜底（error 态 + localStorage 镜像即时呈现），视图显示轻量错误提示。
- 导出失败：toast。
- 源码解析失败：保留 textarea、行内报错、不破坏树。
- 空态：无大纲时引导「新建大纲」。

## 12. 测试策略

高价值、框架无关的纯函数测试为主：

- `outlineOps`：indent/outdent/moveUp/moveDown/mergeDelete/insertSiblingAfter/dragMove/toggleCollapse 的不可变正确性与边界（首/末节点、根层、折叠子树、跨层拖拽非法目标）。
- `outlineSerialize`：往返幂等（tree → md → tree 结构稳定，忽略 id 与 collapsed）、备注段落归属、深层缩进。

编辑器 / 键盘 / 拖拽的集成行为：靠上面的纯函数测试 + CDP e2e（复用既有 remote-debugging-port 往返验证方法）人工验证关键路径。

## 13. 版本与变更记录

按项目约定，功能落地时在 `CHANGELOG.md` 增版本条目，记录：Features（大纲笔记）、Design Rationale（方案 B、WebDAV 私有单文件、文档级合并粒度）、Notes（源码往返重置折叠态的取舍、备注序列化方式）。
