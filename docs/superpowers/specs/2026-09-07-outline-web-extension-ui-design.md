# Outline Web 扩展工作区 UI 重做设计

## 目标

在官方 Outline Web 源码扩展架构内，继续完善论文库、讨论区和文档标签页的视觉与交互，使三个工作区与官方 Web 的主题、组件、间距和导航行为一致，同时完整保留当前已经实现的业务能力。

本次目标不是恢复旧的 `apps/desktop/src/renderer` 页面，而是只修改真正参与产品构建的 `vendor/outline-web` 源码。Electron 壳、官方 Web Router、官方文档编辑器和现有 API/`DesktopBridge` 数据通道保持不变。

## 当前问题

- `vendor/outline-web/app/scenes/Papers.tsx` 和 `Discuss.tsx` 仍将较多业务、布局和样式集中在单个文件中，使用一套与官方页面不完全一致的自定义 styled-components。
- 论文库和讨论区在 `Scene` 自带的标题/操作区之外又渲染一层标题，造成视觉重复、层级松散和工具栏不稳定。
- 两个列表的筛选控件、标签、操作按钮、空状态和加载状态缺少统一的官方 Web 组件语义，窄窗口下容易拥挤。
- `TabBar` 已使用官方 Web 的 MobX store，但标签项仍是最小化实现，缺少完整的固定/关闭菜单、键盘可达性、拖拽反馈和更明确的当前标签视觉。
- 文档的 `/doc/:slug` 与 `/doc/:slug/edit` 已通过 `documentTabId` 合并身份，但所有打开文档的入口需要继续统一经过 `openInTab`，避免再次产生重复标签。

## 设计原则

1. 官方 Web 是唯一视觉来源：优先复用 `Scene`、`Header`、`Button`、`ButtonSmall`、`InputSearch`、`Empty`、官方 icon、主题 token 和既有菜单/弹窗。
2. 业务逻辑与 UI 组合分开：数据抓取、缓存、元数据解析和交互写入不因 UI 重做而改变；必要时只把纯函数或可复用小组件拆出。
3. 信息密度优先于装饰：列表应让标题、上下文、状态和主要动作在第一眼可扫描，不引入与 Outline 不符的大阴影、渐变或独立卡片系统。
4. 所有操作保持可访问：按钮使用真实 button、标签页使用 tab 语义、关闭操作有 aria-label，键盘焦点和 `:focus-visible` 明确可见。
5. 扩展页面与官方文档体验统一：打开论文或主题仍进入官方文档页和官方评论系统，并通过同一标签页模型承载。

## 方案

### 标签页

调整 `vendor/outline-web/app/components/Tabs/TabBar.tsx` 与 `TabsStore` 的组合方式：

- 保留按 team/profile 隔离、固定标签优先、关闭相邻标签、拖拽排序和文档模式去重逻辑。
- 标签栏使用官方主题 token 和 `ButtonSmall`/icon 语义，当前标签通过背景、底部连接和文本颜色形成清晰层级，非当前标签保持低对比度但仍可辨识。
- 为每个非固定标签提供独立关闭按钮；固定标签不显示关闭按钮，但仍可通过右键菜单取消固定。
- 增加标签上下文菜单，至少包含固定/取消固定、关闭当前、关闭其他、关闭全部未固定标签。菜单动作执行后，如果当前标签被移除，导航到 store 返回的最近标签或主页。
- 拖拽只允许同一固定分组内排序；拖拽时显示占位/目标反馈，`onDragEnd` 清理状态，避免残留高亮。
- 保持 `openInTab` 为所有扩展页面打开文档的唯一入口；TabBar 只负责呈现和切换，不复制一套导航逻辑。
- 增加 tablist/tab/关闭按钮的 aria 属性和键盘焦点样式；空标签时不渲染空白栏。

### 论文库

调整 `vendor/outline-web/app/scenes/Papers.tsx`，必要时将纯函数迁移到 `app/scenes/Papers` 下的独立模块并补测试：

- 使用官方 `Scene` 作为页面容器，避免重复渲染第二个页面标题；正文保留一组简洁的页面说明和论文总数。
- 顶部工具区统一为“范围切换 + 搜索 + 筛选/排序”的响应式布局：范围包含全部、我赞过、最近浏览；搜索覆盖标题、英文标题、作者、机构、会议和标签。
- 筛选支持阅读状态和领域标签；排序保留更新时间、阅读量、点赞、评分和标题等已有能力。最近浏览范围固定按浏览时间排序，并在 UI 上明确提示。
- 列表行采用官方 Web 的轻量分隔列表：左侧是论文标题和英文标题/会议/来源等上下文，中间显示少量标签和阅读状态，右侧集中放点赞、评分、原文、代码和阅读状态操作。
- 交互按钮采用 icon + tooltip/aria-label；点击动作必须阻止行点击，打开论文仍记录浏览并调用 `openInTab`。
- 加载、空结果、索引错误和元数据未整理状态使用官方 `Empty`/文本层级；缓存有内容但后台仍在刷新时显示轻量刷新提示，不阻塞已缓存列表。
- 保留论文快照、元数据分批加载、WebDAV 互动记录、点赞/评分、阅读历史和浏览量 API；不更改已有 localStorage key 或 WebDAV 文件格式。
- 论文列表在窄窗口下自动将右侧操作收纳为只显示 icon，标题区域允许收缩；触摸/鼠标命中区域不小于官方按钮规范。

### 讨论区

调整 `vendor/outline-web/app/scenes/Discuss.tsx`：

- 使用官方 `Scene`、`InputSearch`、`Button`、`Empty` 和主题 token；页面正文不再重复制造独立的“仿论坛”卡片。
- 顶部工具区固定提供搜索、刷新和发新帖；发帖表单使用官方输入和按钮风格，支持版块选择、Enter 提交、Escape 取消和提交中的禁用状态。
- 版块筛选使用与论文库一致的轻量过滤控件；主题列表区分置顶主题与普通主题，并在分组标题/间距上提供明确结构。
- 主题行突出标题和最新活动信息，次要显示作者、创建时间、版块、回复/浏览等统计；未读状态用官方强调色和可访问文本表达，不依赖单独的装饰 emoji。
- 保留主题创建、打开官方文档/评论页、搜索、版块筛选、点赞、置顶/取消置顶和错误提示。主题打开统一使用 `openInTab`。
- 置顶、点赞和发帖失败时保持当前列表，不清空已有内容；错误通过页面可见的 inline notice 或官方 toast 机制反馈。
- 没有论坛集合、没有主题、搜索无结果和加载失败分别给出可理解的状态信息，避免空白页面。

## 数据流与边界

```text
官方 Web Router / Layout
        |
        +-- TabBar <-> TabsStore <-> localStorage（按 team 隔离）
        |
        +-- Papers / Discuss Scene
              |
              +-- ApiClient -> Outline API
              +-- DesktopBridge -> WebDAV 互动数据
              +-- openInTab -> 官方 Document Scene + 官方评论
```

- 不新增 BrowserWindow、WebContentsView、HashRouter 或第二套文档编辑器。
- 不把 API token 暴露给扩展页面；继续使用官方 `ApiClient` 和桌面 bridge。
- 不修改 Outline 服务器端数据模型。论文和主题仍是 Outline 文档，互动记录继续遵循现有本地/ WebDAV 约定。
- 论文和讨论区的数据读取必须继续限定在当前 team；标签页、互动、阅读历史不能跨 team 串数据。

## 文件范围

主要修改：

- `vendor/outline-web/app/components/Tabs/TabBar.tsx`
- `vendor/outline-web/app/stores/TabsStore.ts`（仅在交互补全确有需要时修改）
- `vendor/outline-web/app/utils/tabNavigation.ts`
- `vendor/outline-web/app/scenes/Papers.tsx`
- `vendor/outline-web/app/scenes/Discuss.tsx`

可能新增：

- 论文/讨论区共享的官方风格过滤、状态或动作小组件
- 纯函数和 TabBar 行为测试

不在范围内：

- `apps/desktop/src/renderer/features/papers` 和 `features/discuss` 的旧实现
- 官方文档编辑器、评论编辑器、主侧栏基础结构和 Electron 安全边界
- 新的后端 API、数据库迁移或数据格式迁移

## 验证

自动验证：

- 官方 Web 相关 TabStore/tabNavigation 测试：固定、关闭、排序、模式去重、跨 team 隔离和导航动作。
- 论文/讨论区纯函数或组件测试：筛选、排序、版块/置顶分组和空数据分支。
- `vendor/outline-web` 的 `yarn test:app`、`yarn lint:changed` 和 `yarn format:check`。
- 根工程的官方 Web 构建与桌面构建，确认 `outline://app` 使用最新 bundle。

手工验收：

- 浅色/深色主题下检查标签页、论文库、讨论区的间距、焦点、悬停、禁用和错误状态。
- 窄窗口下检查搜索工具栏、论文操作列、发帖表单和主题行不会溢出。
- 从论文库和讨论区打开主题/论文、切换编辑模式、关闭标签、固定标签、切换 team，确认导航和数据隔离正确。
- 验证论文互动、讨论区置顶/点赞/发帖以及官方评论页仍可用。

## 实施顺序

1. 先补齐标签页的导航/菜单/无障碍行为和测试，建立统一文档打开基础。
2. 再重做论文库的页面组合与列表响应式布局，保持数据逻辑稳定。
3. 最后重做讨论区的列表分组、发帖表单和操作反馈。
4. 执行自动验证、构建和手工视觉验收，必要时只调整官方 token 和局部间距。
