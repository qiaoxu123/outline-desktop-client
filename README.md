# Outline Desktop

基于 **官方 Outline Web** 的跨平台桌面客户端，整合论文库、讨论区、随笔、文档标签页与 AI 助手。当前测试版本：`1.20.0-rc.1`。

> `main` 长期停留在旧桌面 renderer；当前产品基线是 `feat/outline-logseq`（v1.19.1）。本轮修改在 `codex/outline-workspace-polish`，实际 UI 在 `vendor/outline-web` 子模块，修改旧 `apps/desktop/src/renderer` 不会改变正式安装包。

## 框架与功能

| 层级 | 职责 |
| --- | --- |
| Electron 主进程 | 窗口、账号配置、系统密钥加密、附件、WebDAV、AI API、`outline://app` 协议 |
| Preload / DesktopBridge | 隔离的桌面能力接口；业务密钥留在主进程 |
| 官方 Web 子模块 | React 17 / MobX / React Router 5；官方文档编辑器、评论、主题、侧栏、搜索 |
| 自定义 Web 场景 | 论文库、讨论区、随笔及标签页；继续使用官方组件与文档路由 |
| 远端 Outline | 实际知识库、文档、集合、评论、权限、浏览数据；客户端不启动另一套 Outline 后端 |
| 本地 / WebDAV | 按工作区的索引快照、阅读状态与历史；现有共享点赞/评分文件 |

论文库读取“推荐阅读”、带 📖 的组内工作和精选专题，支持元数据检索、年份/月/领域/阅读状态、点赞、评分、最近浏览、原文及代码入口。讨论区对应“讨论区”或“论坛空间”集合，帖子即文档、回复即官方评论，支持版块、置顶、未读与互动统计。

## 开发与复现

Node.js 22，Corepack/Yarn 4（子模块）及 npm（桌面工作区）。

```bash
git clone --recurse-submodules https://github.com/qiaoxu123/outline-desktop-client.git
cd outline-desktop-client
git checkout codex/outline-workspace-polish
git submodule update --init --recursive
npm ci
cd vendor/outline-web
corepack yarn install --immutable
cd ../..
npm run build
npm test
npm run verify:build
npm run dev
```

修改官方 Web 场景后，重新执行桌面构建。子模块 commit 必须同步更新，CI 严格构建父仓库锁定的版本。

## 构建、发布与校验

- CI 检查 PR，以及 main/feat 分支变更。
- Release 工作流在版本标签、优化分支推送或手动选择 ref 时运行。
- Web 与桌面入口只构建/测试一次，六个打包任务共享同一份验证过的输出。
- macOS：ARM64 / x64 的 DMG、ZIP；Windows：x64 / ARM64 的 EXE、ZIP；Linux：x64 / ARM64 的 AppImage、DEB。
- 发布前验证 12 个安装包并重新下载计算 SHA-256；仅完整通过后公开 Release。
- 版本必须与根 package.json、桌面 package.json、标签和 `releases/v<version>.md` 一致。每次新测试构建须提升 rc 版本，禁止覆盖已发布测试包。

下载包后，在同一目录使用 `sha256sum --check SHA256SUMS.txt`（Linux）或 `shasum -a 256 -c SHA256SUMS.txt`（macOS）。Windows 可用 `Get-FileHash <安装包> -Algorithm SHA256` 与清单对照。

macOS 安装包为 ad-hoc 签名；首次启动可在 Finder 右键“打开”。Windows 未配置商业签名，首次启动可能需要确认。完整更新内容和人工测试步骤见 [本版说明](releases/v1.20.0-rc.1.md)、[CHANGELOG](CHANGELOG.md)。

## 本轮优化设计

保留官方 Web 为唯一界面基础；共享官方主题、组件和文档路由。索引优先从快照显示，再按需增量更新；同工作区请求合并、每页有界渲染、失败保留旧数据。明确区分文档数据、可降级统计及共享互动写入，避免一次操作触发全界面刷新。

当前 WebDAV 协议仍是共享 JSON 文件；同客户端串行写入可以防止自身覆盖，但多客户端同时写入需要后续服务端事务或 ETag 机制。
