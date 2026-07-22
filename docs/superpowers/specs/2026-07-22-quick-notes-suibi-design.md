# 随记（Quick Notes / flomo-style Memo）设计

> 状态：待评审 · 目标版本 v1.12.0 · 作者：Claude Code
> 关联记忆：`[[personal-notes-design]]`（服务器个人目录，与本功能无关，本功能为本地/WebDAV 独立存储）

## 1. 背景与目标

为客户端加一个 flomo 风格的「随记」：随手记录碎片化知识，读论文/笔记时顺手记一笔并**关联到对应 Outline 文档**，日后翻随记能一眼看到出处并跳转。

设计基调：**轻量、私人、低门槛**。不是又一个知识库集合，而是独立的速记本。

### 目标（v1）
- 极速捕捉：一个输入框，`⌘/Ctrl+Enter` 存，即时上屏。
- 内容 = 轻量 markdown 文本 + 行内 `#标签`。
- flomo 式贡献热力图。
- 标签筛选 + 全文搜索。
- 关联 Outline 文档（两条入口）；卡片展示关联出处、可跳转。
- 完整的编辑 / 软删除回收站 / 批量管理 / 导出。
- WebDAV 私有存储 + 本地镜像 + 多设备安全合并。

### 非目标（后续）
- 图片/附件（当前 WebDAV 通道只传文本）。
- 与讨论区/知识库的「沉淀/公开」集成（已明确砍掉，随记仅个人可见）。
- 关联文档标题的实时刷新（存快照，翻到时惰性刷新即可）。
- 富文本编辑器（表格/嵌入等），保持轻量。

## 2. 可见范围

**仅个人可见。** 每人一个独立文件，互不可见、互不影响。

## 3. 存储

### 3.1 位置
- WebDAV 私有单文件：`5-共享/Outline桌面端/随记/<userId>.json`
  - `userId` 取自 `useUserInfo()`（Outline `auth.info` 的 user.id）。
  - 复用现成 `webdav:get` / `webdav:put` IPC 通道，**主进程零改动**。
- 本地镜像：`localStorage["notes.cache.<userId>.v1"]` —— 开 app 先用缓存秒开，再后台从 WebDAV 拉取回写（沿用 `useDiscussStats.ts` 的离线优先模式）。

### 3.2 文件结构
```json
{
  "version": 1,
  "notes": [
    {
      "id": "n_<epochMillis>_<rand6>",
      "content": "正文，含 #行内标签",
      "tags": ["标签"],
      "createdAt": "2026-07-22T09:00:00.000Z",
      "updatedAt": "2026-07-22T09:00:00.000Z",
      "pinned": false,
      "deletedAt": null,
      "links": [
        { "docId": "uuid", "urlId": "abc123", "title": "关联文章标题快照" }
      ]
    }
  ]
}
```
- `id`：客户端生成，`n_` + 毫秒时间戳 + 6 位随机，全局唯一，作为多设备合并主键。
- `tags`：从 `content` 解析出的去重标签数组，冗余存一份供快速筛选/计数。
- `deletedAt`：软删除标记，`null` = 未删。加载时自动物理清除 `deletedAt` 早于 30 天的记录。
- `links[].title`：存标题快照，渲染卡片与跳转都不需额外请求；标题过期时惰性刷新（低优先，v1 可不做）。

### 3.3 写入与多设备一致性（读改写串行链）
所有写操作走一个串行 promise 链（`chainRef`，建模自 `useDiscussStats.ts` L101-119），每次写：
1. `webdav:get` 拉远端最新 JSON（404 视为空）。
2. **按 `id` 合并**：并集所有 id；同 id 取 `updatedAt` 较新者；本地新增/编辑的记录写入。
3. `webdav:put` 回写合并结果；同步更新 state 与 localStorage 镜像。

冲突策略：**last-write-wins（按 `updatedAt`）**。这样 A 设备保存不会覆盖 B 设备刚写的随记（B 的记录在远端存在、本地无 → 合并时保留）。

## 4. 内容形态

- 轻量 markdown：**粗体 / 斜体 / 链接 / 换行**；`#标签` 高亮为可点击 chip。
- 标签解析正则（中文友好）：`#` 后跟非空白、非常见标点的连续字符，例：`#强化学习`、`#VLA`。存标签文本（不含 `#`）。
- 渲染：正文按标签边界切段 → 标签段渲染成 chip（点击 = 按该标签筛选），其余段做轻量 markdown 行内渲染 + URL 自动链接。
- 不含图片（非目标）。

## 5. 界面

新增 `/notes` 路由 + 侧边栏「随记」项。页面自上而下：

### 5.1 速记框（顶部常驻）
- 多行 textarea，占位提示「记点什么…（#标签 归类，⌘/Ctrl+Enter 保存）」。
- 工具行：`🔗 关联文档` 按钮、字数/标签数提示、「保存」按钮。
- `⌘/Ctrl+Enter` 保存并清空；保存后新卡片即时出现在时间线顶部。

### 5.2 热力图（flomo 贡献格）
- 布局：7 行（周日→周六）× 约 13 列（近 ~90 天/13 周）；圆角小格 + 间距。
- 配色：当天随记数（未删）决定深浅——0 = 深灰 `#39393a`；1/2-3/4-5/6+ 共 4 档递增绿（近橄榄绿，贴近截图）。
- 列底部按月对齐标注「五月/六月/七月」（每月首列下方标一次）。
- hover 显示 tooltip「7月22日 · 3 条」。
- **点格子筛选当天**：点某格 → 时间线只显示当天随记；再点或「清除筛选」还原。
- 主题感知：浅色/深色两套底格与绿阶。

### 5.3 标签栏 + 搜索
- 标签栏：所有标签（带计数），点选=按标签筛选，可与搜索/热力图日筛选叠加。
- 搜索框：对 `content` 做即时全文过滤。
- 有任一筛选生效时显示「清除筛选」。

### 5.4 时间线卡片（倒序）
- 排序：`pinned` 优先 → 再按 `createdAt` 倒序。
- 卡片内容：时间（相对时间，hover 显示绝对时间）、正文（轻量 markdown + 标签 chip）、底部关联文档 chip（`📄 标题`，点击在应用内标签打开 `/document/<docId>`）。
- hover 浮出操作：**编辑 / 置顶 / 复制 / 删除**。
- 置顶卡片有视觉标识并浮顶。

### 5.5 顶部小统计
`共 N 条 · M 个标签 · 连续记录 X 天`（X = 从今天往回连续有随记的天数）。

## 6. 关联 Outline 文档

### 6.1 入口 1 —— 随记页选择器（`DocPicker`）
- 速记框/编辑器内点 `🔗 关联文档` → 弹出选择器：
  - 上区「最近浏览」：`documents.viewed`（读论文时最想关联的通常就是刚看的那篇）。
  - 下区「搜索」：标题搜索 `documents.search`（**需加入 api 白名单**，见 §9）。
- 选中 → 变成输入框上方的 chip，可多选、可 × 移除。

### 6.2 入口 2 —— 读文档时「＋随记」
- 在 `DocumentView` 头部（与历史/评论/信息面板按钮同排）加一个「＋随记」按钮。
- 点击弹出**精简速记 popover**（非整块面板，避免与现有 `"none"|"history"|"comments"|"info"` 面板耦合）：一个 textarea + 已自动预关联「当前文档」的 chip + 保存。
- 保存写入同一 WebDAV 存储（复用 `useNotes` 的 add）。这是「读论文时随手记」的核心入口。

### 6.3 阅读随记时
- 卡片底部把 `links` 渲染为文档 chip；点击在应用内标签打开对应文档，一眼见出处。

## 7. 编辑与管理

### 7.1 单条
- **编辑**：卡片原地展开为编辑器（与速记框一致：标签实时解析、可增删关联 chip）。`⌘/Ctrl+Enter` 保存并刷新 `updatedAt`，`Esc` 取消。
- **置顶**：切换 `pinned`。
- **复制**：复制正文 markdown 到剪贴板。
- **删除**：二次确认（点一下变「确认删除？」再点才删）→ 软删除（打 `deletedAt`）。

### 7.2 软删除 + 回收站
- 删除仅打 `deletedAt`，移出主时间线。
- 头部「回收站」入口列出已删项，可**恢复**（清 `deletedAt`）或**彻底删除**（从数组移除）。
- 加载时自动物理清除 `deletedAt` 超过 30 天者（有界）。

### 7.3 批量管理
- 头部「管理」开关 → 卡片显示复选框 → **批量删除 / 批量置顶（取消置顶）**。
- 全选/取消全选。

### 7.4 导出
- 「导出为 Markdown」：把全部（未删）随记按时间倒序拼成一个 `.md`（含时间、标签、关联文档链接），保存到本地。
  - 实现：渲染端生成字符串 → 触发下载（`<a download>` Blob，或新增 `webdav`-无关的本地保存 IPC；优先 `<a download>` 免主进程改动）。

## 8. 组件与文件

### 新增 `src/renderer/features/notes/`
| 文件 | 职责 |
|---|---|
| `NotesView.tsx` | 路由页：速记框、热力图、筛选栏、时间线、管理模式、回收站、导出的编排 |
| `NotesView.css` | 样式（卡片、热力图格、标签 chip、编辑态） |
| `useNotes.ts` | 存储核心：WebDAV 读改写串行链 + localStorage 镜像；`add/update/remove(soft)/restore/purge/togglePin`；标签/搜索/日筛选的派生；导出字符串生成 |
| `Heatmap.tsx` | 贡献热力图（输入：按天计数 map；输出：格子 + 月标 + hover + 点击回调） |
| `DocPicker.tsx` | 文档选择器（最近浏览 + 搜索），复用 `unwrapIpc`/`api.call` |
| `MemoCard.tsx` | 单条卡片（展示态 / 编辑态、操作、关联 chip）——可选拆分，或先内联于 NotesView |

### 改动
| 文件 | 改动 |
|---|---|
| `src/renderer/App.tsx` | import `NotesView` + 加 `<Route path="/notes" element={<NotesView/>} />`（AppShell 组内） |
| `src/renderer/components/sidebar/Sidebar.tsx` | `sb-quick-nav` 加一个 `navItem("/notes","随记",<OIcon .../>,…)` |
| `src/renderer/components/outlineIcons.tsx` | 若无合适图标，补一个（如 `note`/`pencil`） |
| `src/renderer/features/documents/DocumentView.tsx` | 头部加「＋随记」按钮 + 精简速记 popover（入口 2） |
| `src/main/ipc/handlers/api.ts` | `ALLOWED_METHODS` 加入 `documents.search` |

## 9. 白名单

- 已在白名单：`documents.viewed`、`documents.info`。
- **需新增**：`documents.search`（供 `DocPicker` 标题搜索）。

## 10. 验证

1. `tsc --noEmit` + `npm run build` 通过。
2. CDP 启动 app（`__editor`/需要时临时挂 `__notes` 句柄）走查：
   - 速记框写「测试 #标签A」保存 → 卡片即时出现，`#标签A` 成 chip；`webdav:get 随记/<userId>.json` 里出现该记录。
   - 关联文档：DocPicker 选一篇 → chip 出现 → 保存 → 卡片底部见文档 chip → 点击在应用内打开该文档。
   - 入口 2：文档页点「＋随记」→ 预关联当前文档 → 保存 → 回随记页可见该条且带正确关联。
   - 编辑：改正文与标签 → `updatedAt` 变、内容更新。
   - 软删除/恢复：删 → 移出主列表、进回收站 → 恢复 → 回到时间线；远端 JSON 的 `deletedAt` 随之变化。
   - 批量：管理模式多选 → 批量删除生效。
   - 热力图：当天格随条数变深；点格 → 只剩当天；清除还原。
   - 导出：生成的 `.md` 含全部随记与关联链接。
   - 多设备合并：模拟远端已有一条本地无的记录 → 本地保存后不丢远端那条。
3. 打包 dist:mac 安装到 /Applications 验收。

## 11. 风险与权衡

- **单文件全量重写**：每次保存重写整份 JSON。实验室规模（数百~数千条、~1MB）完全可接受；若未来超大，再迁移到按月分片（`版本` 字段已留）。
- **无 PROPFIND**：现有 WebDAV 通道只有 get/put，故用「每人固定单文件」而非目录枚举，天然规避。
- **last-write-wins**：同一条随记在两设备并发编辑，较晚 `updatedAt` 覆盖较早。速记场景概率极低，可接受。
- **关联标题快照**：源文档改名后 chip 标题可能过期；点击仍能正确打开（用 docId）。惰性刷新列为后续。
