# 官方 Outline Web 源码级扩展方案
## 目标

桌面应用只运行一套 Outline Web React 应用：官方文档、编辑器、表格、标题编辑、搜索和账号状态继续由官方实现负责；个人笔记、论文库、讨论区作为官方侧栏中的扩展入口，在同一个 Router、同一个布局和同一个 Electron 窗口中显示。

## 已确认的官方扩展点

- `app/index.tsx` 创建官方的 MobX Provider、历史对象和 Router。
- `app/routes/authenticated.tsx` 是登录后路由总表，新增本地场景必须在这里注册。
- `app/components/AuthenticatedLayout.tsx` 负责官方布局、侧栏和右侧文档上下文，扩展页面应作为其 children 渲染。
- `app/components/Sidebar/App.tsx` 负责主侧栏入口，扩展入口应使用官方 `SidebarLink` 和 `Section`。
- 官方编辑器位于 `app/scenes/Document`，不复制、不包装当前工程的 TipTap 编辑器。

## 最终架构

```text
Electron main/preload
        |
        v
官方 Outline Web renderer（源码 fork / vendor）
  Provider + Router + AuthenticatedLayout
        |
        +-- 官方 Home / Collection / Document / Search / Settings
        +-- PersonalNotesScene
        +-- PapersScene
        +-- DiscussScene
```

扩展场景通过官方 API client 或一个很薄的 desktop bridge 访问数据；它们不能创建第二个 BrowserWindow、第二个 WebContentsView、第二个 HashRouter，也不能把导航交给当前这套本地 React 应用。

## 迁移边界

当前工程的 `apps/desktop/src/renderer` 是另一套 React 19 + Router 7 + Zustand 应用。它不能与官方 Web 的 React 17 + Router 5 + MobX 组件直接混用。实现上必须选择一种单一来源：

1. 将官方 Web 前端作为 `vendor/outline-web`（保留官方依赖和别名）纳入构建；
2. 在官方源码中新增三类场景和侧栏入口；
3. 将现有 Electron main/preload 的登录、profile 和安全策略适配给官方 Web；
4. 确认后再删除当前本地 renderer 的官方文档替代实现及所有 remote-Web 跳转代码。

不能把官方线上页面与当前本地页面拼接。远程页面与本地 renderer 不在同一 React 树中，注入 DOM 只能做临时按钮，无法共享官方 Router、MobX store、编辑器状态或标题保存逻辑，这正是当前“点击后切换环境”和各种编辑 bug 的根因。

## 分阶段实施和验收

### 阶段 1：源码可构建性验证

- 固定官方 Outline commit。
- 在临时工作区安装官方依赖并执行 `yarn vite:build`。
- 验证 Electron 能加载官方静态 renderer，且登录、文档编辑、标题修改保持可用。

### 阶段 2：同树扩展

- 新增扩展注册表，包含 label、icon、path、scene 和权限。
- 在官方 `AuthenticatedRoutes` 注册 `/personal-notes`、`/papers`、`/discuss`。
- 在官方 `AppSidebar` 使用 `SidebarLink` 渲染三个入口。
- 扩展页面只复用官方布局和 API/session，不改变官方文档路由。

### 阶段 3：桌面适配和清理

- Electron production 只加载打包后的官方 renderer，不再根据点击调用 `loadURL` / `loadFile`。
- 删除 `official-web:open`、`official-web:open-local`、`executeJavaScript` 导航注入。
- 保留外部链接的 `setWindowOpenHandler` 和必要的下载/附件策略。

### 验收标准

- 点击官方文档、个人笔记、论文库、讨论区时，URL 仍由同一个 Router 管理，窗口、布局、登录状态不变。
- 官方文档标题、表格、协作编辑回归测试通过。
- 扩展页面刷新和返回/前进不会跳回另一套平台。
- 构建产物只包含一个 renderer 入口。
