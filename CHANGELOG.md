## [1.11.28] - 2026-07-18

### Features
- **论文双链关系图（新增侧边栏「关系图」入口）。** 仿 Obsidian graph view，只针对论文库：节点为库内每篇论文，边为解读正文里互相引用的 `/doc/…` 内链（从已缓存全文提取，零额外网络请求）。d3-force 力导向 + canvas 渲染，支持滚轮缩放、拖拽平移、点节点跳转论文、悬停高亮邻居、搜索定位、「只看有连接的」过滤，节点大小按引用度。（CDP 实测 778 节点／171 条引用边正常渲染。）
- **论文阅读页点赞 ＋ 浏览量 ＋ 星级评分互动栏。** 📖 论文阅读页头部，在「N 次浏览」旁新增 👍 点赞与 ★ 五星评分，可直接打分。接的是与论文库列表同一份 WebDAV 互动数据（`论文库/interactions.json`），双向自动同步。
- **评论支持编辑。** 自己的评论多出「编辑」按钮，就地改为文本框（Cmd/Ctrl＋Enter 保存、Esc 取消），保留引用行样式；走新增白名单的 `comments.update`。
- **表格编辑对齐网页版（grip 握柄 ＋ ⊕ 插入按钮）。** 移植自 Outline 开源实现：光标进入表格时，行／列边缘出现灰色握柄条（点击选中整行／整列、悬停变深），行列间悬停出现 ⊕ 快速插入按钮，左上角圆点选中整表。原有的表格气泡菜单（合并／拆分／表头／删除）保留。（CDP 实测：握柄渲染、⊕ 插列、整列选中均正常，且不再因 DOM 变更反馈环卡死。）

### Changed
- **论文库改为按「该解读的更新时间」排序，并去掉年／月筛选下拉。** 默认排序「更新时间 新→旧」，排序键取每篇解读文档自身的 `updatedAt`；改过或重存过的解读会自动冒到最前。筛选栏保留搜索／状态／排序／标签。

## [1.11.27] - 2026-07-17

### Fixes
- **知识库内部链接改为在 app 内打开新标签页(不再跳浏览器)。** 点文档里指向本知识库的 `/doc/…`(或 `/s/…`)链接时,解析出目标文档并在客户端打开为标签页;外部链接(OneDrive/arXiv 等)仍在系统浏览器打开——和网页版一致。读视图与编辑器都覆盖。(为此把 `documents.info` 加入 IPC 白名单;已 CDP 往返验证内部链接跳转生效。)

## [1.11.26] - 2026-07-17

### Features
- **表格编辑操作(对齐网页版)。** 单元格本就可直接点选输入;现补上结构编辑:光标进入表格时,底部浮出表格菜单——上/下插入行、删除行、左/右插入列、删除列、合并/拆分单元格、切换表头行、删除整个表格。格式工具栏也新增「插入表格(3×3)」按钮。所有操作正确写回 GFM markdown(已 CDP 往返验证,不丢数据)。

## [1.11.25] - 2026-07-16

### Changed
- **侧边栏图标统一回原来大小。** 四个入口图标改回 18px、内边距恢复原样,和搜索/主页/设置一致(悬停仍显示名称提示)。

## [1.11.24] - 2026-07-16

### Changed
- **侧边栏入口改回纯图标,但图标更大更好点。** 撤销上一版的图标+文字磁贴(偏丑),恢复纯图标;讨论区/论文库/题库/共享 图标 18→22px、按钮内边距加大,点击区更大;悬停显示名称提示。

## [1.11.23] - 2026-07-16

### Changed
- **侧边栏四个入口加文字。** 讨论区 / 论文库 / 自测题库 / 共享链接 由纯图标改为「图标在上、文字在下」的一行标签磁贴,更好认;搜索 / 主页 / 设置仍为图标。

## [1.11.22] - 2026-07-16

### Features
- **个人笔记设置可「暂时跳过」。** 侧边栏「个人笔记」的指向设置(自动定位/手动选择)新增「暂时跳过,稍后再选」——跳过后仅保留一个小「设置个人笔记…」链接,不再占位提示;随时可点回来自选。新成员不必一上来就配置。

## [1.11.21] - 2026-07-16

### Features
- **讨论区帖子加点赞 + 阅读量。** 每个主题行右侧新增👍点赞按钮(全组共享,存于坚果云 WebDAV `讨论区/likes.json`)和「N 阅读」阅读量统计(后台分批拉 views.list、缓存),和论文库一致。

## [1.11.20] - 2026-07-16

### Features
- **标签页可滚动,溢出的标签也能选中。** 打开很多文档后,标签条支持横向滚动:鼠标滚轮(竖向)自动转为标签横向滚动,触控板横滑照常;打开新文档时其标签自动滚动到可见位置(参考 VSCode / Chrome)。标签不再被挤没、后面的也能点到。

## [1.11.19] - 2026-07-16

### Changed
- **分享改为「内部链接」形式(按需求只在团队内分享)。** 点右上角🌐分享,面板直接给出该文档的知识库内部链接(`/doc/…`)+ 复制按钮;发给团队成员,登录且有权限即可打开,不对外公开。去掉了会被服务器拒绝(公开分享未开启)的公开发布开关,更简洁。

## [1.11.18] - 2026-07-16

### Features
- **每篇文档右上角新增「分享」按钮。** 点击弹出分享面板:一键生成分享链接、复制,勾选「公开可访问 / 包含子文档」,或停止分享。链接默认对有权限的团队成员可用;勾选「公开」需服务器开启"公开分享文档"设置,若被拒会提示原因。新增 shares.info/create/update/revoke 到 IPC 白名单。

## [1.11.17] - 2026-07-16

### Features (Windows)
- **Windows 顶部改为无边框单行,对齐 macOS。** 去掉原生深色标题栏,窗口用 `titleBarStyle: hidden` + 原生"窗口控件覆盖层"(min/max/close 显示在右上角,颜色随主题联动);应用自绘的工具栏成为唯一顶栏,右侧图标用 `env(titlebar-area-width)` 自动避让覆盖层(适配 DPI 缩放)。整个顶部从"原生标题栏 + 菜单 + 工具栏"三行压缩为一行。

## [1.11.16] - 2026-07-16

### Fixes (Windows)
- **隐藏 Windows 原生菜单栏。** 窗口加 `autoHideMenuBar`,去掉与应用自身工具栏重复、显得杂乱的 File/Edit/View/Window 菜单条(按 Alt 仍可临时唤出,快捷键照常)。
- **侧边栏在 Windows 上更紧凑。** Windows 字体渲染比 macOS 重、Segoe UI 也略大,同一套 CSS 在 Windows 上显得"粗"。新增 `data-os` 根标记 + 仅 Windows 生效的样式:侧边栏字号 14→13、行高与行内边距收紧,视觉密度对齐 macOS。

## [1.11.15] - 2026-07-16

### Features
- **下划线支持。** 编辑器新增下划线:选中文字点工具栏下划线按钮(B/i **U** S 顺序)或按 ⌘U 即可。下划线以 `<u>…</u>` 存储(Outline 原样保留、可跨端往返),阅读视图与编辑器均正确渲染;已 CDP 往返验证。

## [1.11.14] - 2026-07-16

### Fixes
- **标签页文字加粗更清晰。** 全站用了 `-webkit-font-smoothing: antialiased`(macOS 上字重偏轻),标签页标题此前为常规字重,显得单薄。现标签标题改为 500,选中标签 600,更清晰易读。

## [1.11.13] - 2026-07-15

### Features
- **标签页可拖动重排。** 顶部打开的文档标签页现在支持拖拽调整顺序(拖动时半透明、落点显示插入指示线),顺序持久化;固定标签仍保持在最前。

## [1.11.12] - 2026-07-15

### Fixes
- **修复客户端编辑表格导致数据丢失（严重）。** 编辑器保存含表格文档时,`tiptap-markdown` 内建表格序列化器遇到"多块单元格"(如多行作者)会退化成字面 `[table]`,覆盖真实表格(专利汇总即因此被清空)。现注入健壮的 GFM 表格序列化器:逐单元格渲染、多行/换行用 `<br>` 表示、把解析器 HTML 转义的 `&lt;br&gt;` 还原为 `<br>`,并同步给编辑器解析器补 `<br>→硬换行` 规则。已在真机 CDP 往返验证:标题/表格结构/多行单元格/链接均无损。

### Features
- **上传进度提示。** 拖拽/粘贴上传时底部显示"正在上传 N 个文件…"转圈提示,不再"以为没上传";失败会就地插入"⚠️ 上传失败"提示。
- **附件下载改为单行。** 非图片附件插入为「📎 文件名  下载」同一行(下载链接用绝对 URL,规避 Outline 对相对附件链接的块化/中文标签损坏),多个文件更紧凑。

## [1.11.11] - 2026-07-15

### Features
- **编辑器支持拖拽 / 粘贴上传附件。** 把图片或文件拖进(或粘贴到)文档正文即自动上传到 Outline:上传走主进程(`attachments.create` → `files.create`,用 Electron `net.fetch`,API key 不进渲染进程)。图片插入为图片节点;其它文件插入为"文件名(粗体)+ 一行 Download 链接"两段式,规避 Outline 对含 CJK 的附件链接标签的损坏(会把中文标签变成 nullx0 并吞掉同行文字)。

## [1.11.10] - 2026-07-15

### Fixes
- **文档内链接可点击跳转。** 编辑者看到的是"常开编辑器",其 `Link` 之前设为 `openOnClick:false`,导致点击链接(如专利汇总里的 OneDrive 下载链接)无反应。现改为 `openOnClick:true`,点击即通过系统浏览器打开外部链接。

### Notes
- 已知待办(下个版本):客户端编辑器保存"含表格"文档会把表格降级成 `[table]`(数据丢失,tiptap-markdown 缺表格序列化)——修复前请用网页版编辑此类文档;拖拽/粘贴上传附件功能开发中。

## [1.11.9] - 2026-07-15

### Features
- **正文标题标注层级。** 文档正文里每个标题的左侧空白处会显示一个小灰标签 `H1`/`H2`/…/`H6`,一眼看清是几级标题;标签绝对定位在左侧栏内,不挤占正文、不改变标题文字对齐。同时给此前无样式的 H5/H6 补上层级字号,层次更清晰。

## [1.11.8] - 2026-07-15

### Fixes
- **修复表格(及正文)中 `<br>` 被当作字面文本显示。** 渲染器 `html:false`(防 XSS),导致 Outline 用于单元格内换行的 `<br>` 标签被转义成字面 `<br>` 文本——多行单元格的表格看起来全是乱码。现新增一条只匹配 `<br>/<br/>/<br />`(不含任何属性,无注入面)的 markdown-it 内联规则,把它渲染成真正的换行,而不放开完整 HTML。表格结构本身一直正常,受影响的只是含 `<br>` 的单元格。

## [1.11.7] - 2026-07-15

### Fixes
- **论坛区打开的文章现在跟随「阅读宽度」设置。** 此前论坛帖子(经 `/document/:id` 打开的 DocumentView)带 `.discuss-topic` 类,被硬编码为固定 1280px,无视设置里的宽度档位。现移除该覆盖,论坛文章与普通文档一致,响应全部 5 档宽度(含全宽)。

## [1.11.6] - 2026-07-14

### Fixes
- **修复论文库论文骤减(700+ → 419)。** 「精选专题」已从「扩展学习」的 精选论文 子树拆分为独立顶层 collection,客户端此前只遍历「扩展学习/推荐阅读 + 精选论文」与「组内工作」,遗漏了「精选专题」collection 里的 ~318 篇 📖 论文。现按名称解析并遍历「精选专题」collection(专题文件夹为容器、📖 为论文,行内以 专题名 标注),元信息扫描同步覆盖。恢复后论文库共约 737 篇。

### Design Rationale
- 「精选专题」树形与旧 精选论文 子树同构,复用 `collectFeatured` 即可;「组内工作」「精选专题」两个外部 collection 合并为一次 `collections.list` 解析,避免重复请求。

## [1.11.5] - 2026-07-14

### Features
- **论文库支持按英文原题搜索。** 论文标题均为中文翻译,此前搜英文原题搜不到。现从每篇论文属性表的「论文标题」行解析英文原题(实测覆盖 ~95% 论文),纳入搜索匹配范围;论文链接(含 arXiv 号)也一并可搜。每行中文标题下以小灰字显示英文原题,便于确认。

### Design Rationale
- 英文原题已存在于论文正文属性表,`parsePaperMeta` 复用现有表格解析即可提取,零额外请求;元信息缓存版本 v3→v4 以便升级后自动重解析补上 enTitle 字段。

## [1.11.4] - 2026-07-14

### Features
- **论文库收录「组内工作」的解读论文。** 论文库此前只索引「扩展学习」(推荐阅读 + 精选论文);现同时收录「组内工作」集合中带 📖 前缀的解读文档,行内以「组内工作」标注;元信息扫描同步覆盖该集合(标签/发表/链接照常解析)。

## [1.11.3] - 2026-07-14

### Fixes
- **修复"调节页面宽度不管用"。** 原宽度档位(920/1100/1280/1460)大多超过实际窗口可用宽度,导致切换档位后正文宽度不变(始终被窗口限制)。现把档位重排为真正生效的更窄区间——最窄 760 / 较窄 920 / 适中 1100 / 较宽 1320 / 最宽 全宽,较窄档位在常规窗口下即可见效。
- **默认阅读宽度改为更舒适的「适中」≈1100px**(即原「较窄」宽度);一次性迁移把现有用户重置到该默认。

## [1.11.2] - 2026-07-14

### Features
- **标题栏新增刷新按钮。** 一键重新拉取服务器数据(集合、文档树、论文库、评论等),服务器端的移动/编辑无需重启即可显示——解决了"笔记列表仍显示已移动文件"的缓存问题。
- **讨论区回复数改用评论图标。** 帖子列表右侧的「暂无回复 / N 回复」文字换成评论图标(0 回复只显示图标,>0 显示图标+数字),更简洁,与全站图标风格一致。

## [1.11.1] - 2026-07-14

### Features
- **集合「概览」可编辑。** 集合视图新增「概览 / 文档」标签:概览页把集合的描述(collection description)以富文本编辑器呈现,可直接编辑并自动保存(`collections.update`,1.2s 防抖),对齐网页版的概览标签;文档标签仍是原来的文档树。此前客户端打开集合直接是文档列表、无法编辑集合说明。

## [1.11.0] - 2026-07-14

### Features
- **论文库收录「精选论文」专题树。** 论文库此前只遍历「推荐阅读」年/月树,挂在「精选论文」下的论文(如 LERF)只能全局搜到、库内检索不到。现同时收录 `精选论文` 树中带 📖 前缀的论文,行内以「精选 · <专题>」标注;论文总数 336 → 673。
- **论文点赞/评分迁移到 WebDAV。** 原先用集合内的 `⚙️ 论文互动数据` 文档存储(污染侧边栏),现改存坚果云 WebDAV `论文库/interactions.json`;历史数据已迁移、遗留 ⚙️ 文档已归档。WebDAV 目录收敛为 `5-共享/Outline桌面端/{自测题库,论文库}`,处理器支持子目录(PUT 自动 MKCOL)并拒绝 `..` 越界。
- **全应用统一采用 Outline 官方 outline-icons 图标。** 选择工具栏(图标与按钮顺序对齐网页版 formatting.tsx)、侧边栏、标题栏、文档页、论文库、标签栏全部换用官方矢量图标。
- **题库管理员编辑器 + 换行/高亮。** 添加/编辑/删除题目限管理员;编辑器带格式工具栏(加粗/高亮/代码/列表/换行)+实时预览,答案单换行即生效、`==高亮==` 渲染黄底标记。

### Fixes
- **桌面端带引用的评论现在会高亮正文对应位置。** 从评论正文的 `「引用原文」` 反推锚点喂给高亮插件,补上桌面评论无法持久化锚点标记的缺口。
- **切换页面/搜索后不再停在半截。** 各路由记忆各自滚动位置(离开长文档返回列表不再继承其偏移);论文库改筛选/排序自动回顶。
- **表格字体与正文一致**(此前单元格 14px、表头 13px,正文 16px);**正文行高 1.75 → 1.5** 与网页版一致;**论文库搜索栏加大**。
- **选择工具栏收紧**(28px 按钮、零间隙、6px 圆角),对齐网页版观感。

### Notes
- WebDAV 目录结构变更:题库数据已从旧路径迁移到 `Outline桌面端/自测题库/`,旧路径保留作备份。

## [1.10.0] - 2026-07-13

### Features
- **自测题库（Anki 式间隔重排）。** 新的 `/quiz` 页,翻卡自评 → SM-2 记忆曲线安排下次复习。题库与进度同步到坚果云 WebDAV(主进程 IPC 绕过渲染层 CORS):`bank.json` 全组共享(首次运行以内置 32 题 Transformer/LLM 题库播种)、`progress-<userId>.json` 按各自账号保存;localStorage 镜像保证秒开与离线。
- **题库：管理员编辑器 + 全组点赞/评论。** 添加/编辑/删除题目限管理员(按账号 `isAdmin`/admin 角色);编辑器带格式工具栏(加粗 `**` / 高亮 `==` / 代码 / 有序·无序列表 / 换行)与实时预览,答案按 `breaks:true` 渲染(单个回车即换行)、`==高亮==` 渲染为黄底标记。每张卡有全组共享的 👍 点赞与可编辑评论(存 `interactions.json`,read-modify-write 绝对化操作合并并发)。
- **论文库：排序 + 团队点赞/五星评分 + 阅读量。** 排序下拉(推荐时间/阅读量/点赞/评分/标题自然序);每行 👍 与 ★ 评分(浮层选 1-5 星,点当前分数清除),数据存在论文库集合顶层的注册表文档 `⚙️ 论文互动数据`(读取搭 documents.list 元数据扫描便车零额外请求,写入为 read-modify-write 只合并本人条目);阅读量后台分批 views.list(并发 8,localStorage 缓存 30 分钟)行内显示并支持排序。
- **目录停靠栏。** 文档目录从悬浮卡片改为停靠在窗口最右缘的独立滚动栏(portal 到 AppShell 的 .toc-slot),正文滚动区在其左侧结束互不遮挡;无目录时自动折叠;≤1100px 隐藏。
- **浏览量记录与显示。** 打开文档自动 views.create(此前桌面端从不上报,阅读不计数);查看者头像后显示总浏览次数。
- **评论/历史按钮图标化。** 与星标一致的纯图标按钮,评论数以小数字随图标显示,完整说明在悬停提示。
- **侧边栏快捷导航整合。** 全部导航并为一行纯图标:搜索·主页·设置 ｜ 讨论区·论文库·自测题库·共享链接,两组以 ｜ 分隔。

### Fixes
- **阅读宽度默认值改为「适中」(1280)** 与置顶的论坛/论文库页对齐(此前默认最窄,和其它页不一致)。
- **带引用的评论提交失败(`data: Invalid data`)。** Outline 评论 schema 拒绝 blockquote 节点;改用斜体 `「…」` 段落引用。
- **内联改标题后侧边栏/标签标题不更新。** 保存时按标题变更失效对应的集合/子文档/标签缓存查询。
- **题库主按钮 hover 看不清。** 主按钮 hover 由提亮改为加深(提亮把白字冲淡);禁用态改为清晰灰色。

### Design Rationale
- 题库不落 Outline 笔记本身而走 WebDAV:需要 Anki 式的 per-user 进度与轻量 JSON 结构,Outline 文档模型不合适;主进程代理规避渲染层跨域。
- 点赞/评分选注册表文档而非逐篇评论聚合:一次读取覆盖全部论文,实验室规模下 last-write-wins 冲突可接受;Outline 无文档级点赞 API。
- 题库/论文互动均以「读最新→只改本人条目→写回」的绝对化操作合并,降低多人并发覆盖风险。

### Notes & Caveats
- WebDAV 凭据(坚果云应用密码,限定于一个共享目录)按用户要求硬编码在主进程,可从安装包中提取——仅用于该实验室共享题库。
- 阅读量首次全量拉取约 30-60 秒(后台渐显);views 无批量接口。
- 注册表文档会出现在论文库集合的侧边栏树中(标题带 ⚙️ 与勿编辑提示)。
- 内置 32 题为首次播种的初始内容,多为单段落;管理员可用新编辑器逐张补换行/高亮。

## [1.9.1] - 2026-07-12

### Fixes
- **邮箱验证码登录报 "Redirect was cancelled"。** Electron 的 `session.fetch` 不支持 `redirect: "manual"`——服务器验证成功返回 302 时请求被直接取消抛错，客户端在读到会话 cookie 前就失败（验证码却已被消费）。改为 `redirect: "follow"` 并以 cookie jar 为准判定登录成功；失败时从最终 URL 的 `?notice=…` 解析具体原因。已对 notes.jlu-mcns.site 做完整验证码往返验证。

## [1.9.0] - 2026-07-11

### Features
- **Lossless LaTeX math nodes (web parity).** Replaced the decoration-based `@tiptap/extension-mathematics` with dedicated `MathInline` / `MathBlock` atom nodes (`features/documents/extensions/math.ts`), mirroring Outline web's `math_inline` / `math_block`. LaTeX lives in a `latex` attribute and serializes via `state.text(latex, false)` — **no markdown escaping**, so `\frac`, `_{i,j}`, backslashes and multiline `\begin{aligned}` blocks round-trip byte-identically. Parsing reuses `@vscode/markdown-it-katex` inside tiptap-markdown (same plugin as the read view, so read/edit semantics match by construction). `flattenBlockMath()` is gone. Node views render KaTeX and switch to a source input on click (Enter/blur commits, Esc cancels, empty deletes; block math commits on Cmd/Ctrl+Enter); `$...$` input rule and a ∑ bubble-menu button create formulas.
- **Threaded comments aligned with web.** Comments panel now groups replies under their parent (`parentCommentId`), supports reply / resolve / unresolve (`comments.resolve|unresolve`) / delete-own (two-step confirm), and shows each thread's anchored source text. Web-created anchored comments are highlighted inline in the editor via a decoration plugin (`extensions/commentHighlights.ts`) that locates `anchorText` (from `comments.list … includeAnchorText: true`) by first exact text match; clicking a highlight opens the panel focused on that thread. A 💬 bubble-menu button creates a new comment quoting the selection (as a blockquote in the comment body — desktop-created comments are intentionally *unanchored*, see Caveats).
- **Tabs on top, path below.** Document tabs moved into the titlebar (pill style, next to back/forward); the breadcrumb path moved to its own strip under the titlebar (`.breadcrumb-bar`, new `--breadcrumb-height` token) — matching the requested layout.
- **Sidebar node actions (web parity).** Hovering a document row reveals “+” (new child document) and “…” (menu: 新建子文档 / 收藏 / 重命名 / 复制 / 归档 / 删除, destructive ops two-step) — `components/sidebar/DocActions.tsx`. Collection rows get a hover “+” to create a root document.
- **Natural title sorting.** `lib/naturalSort.ts` (`Intl.Collator('zh-CN', {numeric: true})`) fixes "1, 10, 2" ordering: personal-notes children, star children, nested-document lists always sort naturally by title; collection trees only when the collection's own sort is `title` (manual index order untouched).
- **Collapsible + persistent collections.** The 集合 section header now collapses like 星标, and both the section state and per-collection expansion persist to localStorage (`ui.collectionsOpen`, `ui.expandedCollections`) instead of resetting every remount.
- **Also shipped (previously implemented, uncommitted):** always-on editing (open == editable with 1200ms-debounced autosave, save-state pill, ⌘S flush — replaces the separate 编辑 button), adjustable reading-column width (设置 → 最窄…最宽, 5 levels, `--reading-col`), one-click light/dark toggle in the titlebar, and the icon-only quick-nav row (搜索/主页/设置) in the sidebar.

### Features (post-release additions)
- **Single width control.** Removed the titlebar 一键全宽 button (and the `ui.fullWidth` state) — page width is now controlled only from Settings (level 5 = full width). 论坛区 / 论文库 index pages and forum topic pages are pinned at a fixed 920px column regardless of the setting, so the boards keep their forum-like narrow layout.
- **Fixed: Settings 页面宽度 had no visible effect.** The titlebar 全宽 toggle (`ui.fullWidth`, persisted) silently overrode the width levels — once toggled on, levels 1–4 did nothing. Picking a level in Settings now turns full width off, and while full width is active Settings highlights 最宽 instead of the stale stored level. (Note: in a window narrower than the chosen level the column is clamped by the window — levels only differ visibly when there's room.)
- **论文库 truly instant open.** The paper *list* (collection tree) is now persisted too (`papers.treeCache.v1`, initialData pattern) — previously only the metadata was cached, so every reopen after a restart or the 5-min query GC still showed 加载论文列表…; now 331 rows render in ~30ms from cache with a silent background refresh. Sidebar entries also bumped to bold (600, team name 700) matching web.
- **讨论区 / 论文库 right-click → open in new tab.** Topic rows and paper rows now share a lightweight context menu (`hooks/useDocContextMenu.tsx`, reusing the sidebar `.sb-menu` styles) with 在新标签页打开 — adds a background tab without navigating, matching the sidebar row behavior.
- **论文库 instant open (persistent cache).** Metadata now comes from paging `documents.list` over the whole collection (~4 requests, text included) parsed in one pass, instead of 60 concurrent per-document fetches that each re-rendered the list; the parsed result persists to localStorage (`papers.metaCache.v1`) so reopening paints instantly (331 rows < 400ms) with a silent background refresh.
- **Floating TOC.** The document table of contents is now a floating card overlaying the right edge (web-like) instead of claiming a grid column — it no longer squeezes the article at medium widths; hidden ≤1100px.
- **Sidebar right-click menu + open in new tab.** Right-clicking a document row opens the “…” actions menu at the cursor; new 在新标签页打开 item adds a background tab without navigating.
- **Migrated-content repairs (server-side).** Tables collapsed by Discourse's blank-line-between-rows style fixed in 7 posts; all 8 migrated replies rebuilt (quote lines → italic 「…」 segments since Outline's comment schema rejects blockquotes, `@"user"#pNN` headers cleaned, 迁移自 wording dropped).
- **论坛空间 categories + content cleanup.** The forum collection (renamed 论坛空间 by the user; client now matches 论坛空间→讨论区 by name and creates 论坛空间) is organized into 5 版块 parent docs — 📄 论文与前沿 / 🛠 工具与资源 / 🎓 课程与教程 / 💻 工程实践 / 📢 组内公告 — with all 47 migrated topics moved under them (script `apply-posts.js`). Board UI gained category filter chips, per-row category tags, and a 版块 select in the composer (topics list now spans the whole collection, category containers excluded). All migrated posts were format-fixed by 4 parallel Sonnet subagents: provenance footers removed (per request), 8 collapsed single-backtick code blocks rebuilt into fenced blocks, 20+ `:emoji:` codes converted to Unicode; the welcome topic now documents the 版块 structure.
- **论文库 (`/papers`).** A search view over the 推荐阅读 tree — the server's 年/月 folder habit stays untouched; the client auto-locates the root, walks year/month folders into paper entries (331 found), and parses each paper's attribute table into structured metadata (领域 → clickable tag chips, 发表时间/venue, 论文链接 → external-open button). Filters: keyword (title/tags/authors/org), year, month, read state; aggregated top-tags bar; personal 未读/在读/已读 cycling badges (localStorage). Metadata fetches share the `documents.info` cache, so opening a paper is instant.
- **Discourse migration.** One-shot Electron script (`scratchpad`, shares the app session) migrated all 47 forum topics into 讨论区: first post → document (raw markdown + provenance footer with original author/date/link), replies → comments with author headers. Idempotent by title. Topic list page size raised 50 → 100.
- **讨论区 UX round 2.** Topic list now sorts by *real last activity* (replies included — they don't bump updatedAt server-side, so reply queries are lifted and sorted client-side); breadcrumb on topic pages links back to `/discuss` instead of the raw collection; the 讨论区 collection is hidden from the sidebar 集合 list (single click-path); sidebar entry gained a new-topics badge (`discuss.lastVisit` watermark); own topics can be deleted from the list (hover, two-step); manual 刷新 button. Fixed a StrictMode race where the collection bootstrap could create 讨论区 twice (module-level in-flight guard; the stray empty duplicate was deleted server-side; `collections.delete` whitelisted).
- **Removed the Discourse webview module (社区论坛).** Superseded by the native 讨论区; webviewTag, the forum pane, unread badge and `forum:latest` IPC are gone.
- **Native 讨论区 (forum on Outline).** New `/discuss` view: topics are documents in a dedicated 讨论区 collection (auto-created on first open, team read_write), replies are document comments — same account as the knowledge base by construction. Topic list shows author avatar, reply count, last-activity time and per-topic unread dots (localStorage watermarks); 发新帖 creates and opens a topic. Topic pages render replies as a full-width stream **under the article body** (forum layout — `CommentsPanel inline` variant) with the composer at the bottom; the header button becomes 回复 N and scrolls to the stream. Whitelist additions in `api.ts`: `collections.create`, `documents.update/duplicate/archive`, `comments.resolve/unresolve` (the latter had silently broken sidebar rename/duplicate/archive and comment resolve — fixed).
- **Forum unread badge.** The 社区论坛 sidebar entry shows a count of topics bumped since the forum was last opened (main-process fetch of Discourse `/latest.json` with session cookies, 5-minute polling; watermark `forum.lastSeen` in localStorage starts at first run and resets on entering the forum). Hidden when logged out or the forum is unreachable.
- **In-app community forum.** New 社区论坛 sidebar entry embeds https://forum.jlu-mcns.site/ via `<webview>` (`features/forum/ForumPane.tsx`): its own back/forward/reload toolbar + open-in-browser, links open externally, and the pane stays mounted while hidden so login session, history and scroll survive switching views. Main process enables `webviewTag` and routes webview popups to the system browser.

### Fixes
- **主页宽度与论坛/论文库一致。** HomeView 容器此前写死 `max-width: 720px`，在宽窗口下显得过窄；现改为 1280px，与讨论区 / 论文库的固定"适中"列宽一致。
- **Image adjustment UI (web parity).** Selecting an image shows a floating toolbar — layout (左侧环绕 left-50 / 居中 / 右侧环绕 right-50 / 全宽 full-width), live size label, download (main-process `downloadURL`, auth injected), delete — plus side drag-handles that resize with aspect ratio preserved. Layout and size persist in the markdown title using Outline web's exact convention `![alt](src "layoutClass =WxH")` (verified round-trip), so adjustments made here render identically in web and vice versa. New `extensions/image.ts` + `lib/markdown/imageTitle.ts`; the read pipeline decodes the same title convention.
- **Document images now display.** Attachments are stored as relative `/api/attachments.redirect` paths behind authentication, so `<img>` tags loaded nothing. Two-part fix: the main process injects the matching profile's `Authorization: Bearer` header for renderer requests to known servers (`webRequest.onBeforeSendHeaders`), and both render pipelines absolutize the src for display only — node attrs / markdown source keep the relative path (verified: 4/4 images load on a real doc).
- **Tab context menu + pinned tabs.** Right-click a tab: 固定/取消固定、关闭、关闭其他、关闭全部. Pinned tabs sort first, lose their close button, survive bulk-close, and tabs now persist to localStorage (`ui.tabs`) so they restore after restart.
- **Document actions moved to the top-right.** Save-state / viewers / star / 评论 / 历史 now live at the right end of the breadcrumb bar (portaled via `#doc-actions-slot`); the 直接编辑自动保存 hint line under the title is gone — the title row is clean.
- **Selection toolbar restyled with SVG icons.** Emoji glyphs (🔗💬⌫❝•☑) replaced with Material-grid SVG icons (quote/lists/link/comment/clear-format) matching Outline web's iconography; larger 32px buttons, softer shadow, blue active pill.
- **Drag-resizable sidebar.** New right-edge drag handle (200–420px, persisted to `ui.sidebarWidth`).
- **Code block font size.** 13px hardcoded → `0.9em` of body (≈14.4px), matching web proportions in both editor and read view.
- **Whole-sidebar scrolling.** The mouse wheel previously only worked over the collections section (`.sb-section-grow` owned the overflow). Everything between the pinned team header/quick-nav and the pinned account footer now lives in one `.sb-scroll` container — 星标/个人笔记/集合 scroll together.
- **Table sizing.** Removed the conflicting duplicate `table { width: 100% }` block in `Editor.css` (the compact `width: auto` block now solely applies), and wide tables scroll horizontally inside a `.tableWrapper` div emitted by both pipelines (a `Table.extend` renderHTML in the editor; `table_open/close` renderer overrides in the markdown-it read path).
- Settings 关于 now shows the real app version from `package.json` (was hardcoded "v0.2").

### Design Rationale
- Math as atom nodes (not text + decorations) is the only way to exempt LaTeX from markdown escaping — the serializer escapes *text* nodes, not attributes. Hand-rolled (~340 lines) instead of `@benrbray/prosemirror-math` because the latter embeds a nested EditorView per formula, which composes poorly with tiptap-markdown; zero new dependencies.
- Desktop-created comments are unanchored by design: Outline's `comment` mark is deliberately not serialized to markdown (verified in outline/outline source), so an anchor created here could not survive our `documents.update` text save. Quoting the selection into the comment body gives context without fighting that constraint.
- tiptap-markdown calls each extension's `parse.setup()` on *every* parse against one shared markdown-it instance — the katex plugin registration is guarded by a flag to avoid duplicate ruler entries.

### Notes & Caveats
- **Verify against the live server** (needs a signed-in profile): whether `documents.update` full-text saves preserve *web-created* anchor marks server-side (`documentUpdater` reportedly merges, unverified). This risk predates this release — the always-editable autosave already replaced full text — but anchored-comment display makes it visible. If anchors are lost after desktop edits, the inline highlights disappear while the panel still shows threads with their `anchorText`.
- `comments.resolve` / `includeAnchorText` require a reasonably recent Outline server; on older servers resolve buttons will surface 操作失败 and anchors simply won't render.
- Inline `$$…$$` display math inside a paragraph is normalized to a standalone block on the next save (semantically identical, renders the same in web).

## [1.8.0] - 2026-06-13

### Features
- **Personal notes zone (个人笔记).** A dedicated sidebar section that points at the user's *existing* personal folder on the server (e.g. `成员笔记 / 博士 / 乔旭`) rather than a new collection or local storage. New notes are created as ordinary documents nested under that folder (`documents.create` with `parentDocumentId`), so they sync normally and never clutter the collection list. The viewer/editor are the unmodified document flow — personal notes look and behave exactly like any other document. The folder pointer (docId + collectionId) is stored per-profile in `profiles.json`; on first use the app auto-detects it by matching a document titled with the user's own name inside a `成员笔记`-like collection, with a manual tree picker as fallback.
  - New: `main/ipc/handlers/personalNotes.ts` (getRoot/setRoot/clearRoot), `renderer/hooks/usePersonalNotes.ts`, and a `PersonalNotesSection` + `PersonalRootPicker` in `Sidebar.tsx`. `StoredProfile` gained optional `personalRootDocId` / `personalRootCollectionId`.

### Design Rationale
- Considered (a) private server collections — rejected: Outline admins bypass collection membership (`server/policies/collection.ts` grants read on `user.isAdmin`), and it adds a top-level collection. (b) Local-only storage — rejected: no sync. Mapping the zone onto the member's pre-existing server folder gives clean structure *and* sync with zero backend changes.

### App icon
- **Official Outline icon.** Bundled `apps/desktop/build/icon.icns` (+ `icon.png` for win/linux) generated from Outline's official `icon-512.png`; wired via `mac.icon` / `win.icon` / `linux.icon`. Replaces the default Electron icon.

### UI / Polish
- **Responsive document layout.** The fixed 3-column grid (gutter · 760px article · right rail) now degrades gracefully: ≤1100px drops the left gutter so the article keeps its width; ≤860px collapses to a single column, hiding the TOC and flowing the history/comments panels below the article instead of squeezing them into a side rail. View paddings use `clamp()` so they shrink on narrow windows.
- **Typography tokens.** Added a font-size scale (`--text-xs`…`--text-2xl`) and line-height scale (`--leading-*`) in `AppShell.css`; refactored body/document/heading/code sizes onto them (values unchanged, single source of truth).
- **Native-feeling fonts.** `--font-sans` now leads with `system-ui` / `-apple-system` (SF Pro on macOS) and drops the unbundled `Inter`; added `font-synthesis: none` and `text-rendering: optimizeLegibility` for long-form text; added a `--font-serif` token for future use. Removed the duplicated hardcoded font stacks in `App.tsx` (now `var(--font-sans)`).
- **Theme-consistent code blocks.** Read-view fenced code blocks moved off a hardcoded hex onto `--color-codeblock-bg`/`--color-codeblock-text` tokens (still dark to match the highlight.js theme), which also fixes a latent dark-text-on-dark-background contrast bug for unhighlighted code in light mode.

### Build
- **macOS ad-hoc code signing.** `electron-builder` now ad-hoc signs the packed `.app` via an `afterPack` hook (`apps/desktop/build/after-pack.js`), with `mac.identity: null` (skip electron-builder's own signing so it doesn't overwrite the ad-hoc signature) and `mac.gatekeeperAssess: false`. Without an Apple Developer ID this removes the *"app is damaged"* error on Apple Silicon; first launch still needs right-click → Open, or `xattr -cr` (documented in README).
- **ESLint v9 flat config.** Added `apps/desktop/eslint.config.mjs` (the repo previously had none, so `npm run lint` errored before linting); dropped the unsupported `--ext` flag from the lint script and removed pre-existing unused variables it surfaced.

### Notes & Caveats
- Building `dist:mac` behind the local proxy fails with `unable to get local issuer certificate` (proxy MITM on electron-builder's downloads). Build with `NODE_TLS_REJECT_UNAUTHORIZED=0 npx electron-builder --mac`. Not baked into the npm script to avoid weakening TLS for everyone.

## [1.7.0] - 2026-06-08

### Features
- **Highlight color picker (6 Outline presets).** The highlight button now opens a swatch popover with Outline's exact preset palette — 珊瑚黄 #FDEA9B, 杏橙 #FED46A, 落日橙 #FA551E, 青柠 #B4DC19, 泡泡紫 #C8AFF0, 霓虹蓝 #3CBEFC — plus a remove option. (Markdown stores `==` only, so the specific color is a live-editor attribute and falls back to default on reload — this matches Outline's own markdown export.)

## [1.6.0] - 2026-06-08

### Features
- **Richer selection toolbar.** The bubble menu shown when selecting text now matches the web app much more closely: **highlight**, H3, ordered list, task list, and clear-formatting added alongside bold/italic/strike/code/H1/H2/quote/bullet-list/link.
- **Text highlight.** New highlight button marks text; serialized to `==text==` so it survives the markdown round-trip and renders (yellow `<mark>`, dark-mode aware) in both the editor and the read view (markdown-it-mark). 
- **Toolbar restyled** as a light card with a subtle border/shadow (was a dark bar), matching the rest of the UI; active buttons highlight in the accent color.

## [1.5.0] - 2026-06-08

### Features
- **Nested child documents.** A parent document now lists its child documents in a "文档" section at the bottom (like the web app), each clickable to open. Hidden when the document has no children.

## [1.4.3] - 2026-06-08

### Fixes
- **Tabs flush to the sidebar.** Removed the tab bar's left padding so the first tab's left edge aligns with the sidebar's right edge (the content area's left edge).

## [1.4.2] - 2026-06-08

### Fixes
- **Breadcrumb shows the full document path.** It previously jumped Collection › Document, skipping intermediate parent documents. It now walks the collection's document tree to render the complete ancestor chain (Workspace › Collection › Parent › … › Document), each ancestor clickable.
- **Tabs align to content.** Reduced the leading gap and made the active tab overlap the bar's bottom border so it merges into the content area below (browser-tab look).
- **Wider table of contents.** TOC panel widened 200 → 240px with slightly larger text for readability.

## [1.4.1] - 2026-06-08

### Fixes
- **Sidebar hierarchy now reads clearly.** Nested documents used a flat 14px-per-level padding with no visual guide, so deep trees looked nearly flush and the parent/child relationship was hard to see. Switched to nested containers with a per-level indent **and a vertical guide line** (Outline / wolai style); leaf documents show a small dot instead of a chevron. Applies to collection trees and starred-document subtrees.

## [1.4.0] - 2026-06-08

### Features
- **wolai-style breadcrumb.** The title bar now shows the location path — Workspace › Collection › Document — with collection/document emoji, replacing the static "Outline" label. Each segment is clickable (workspace → home, collection → collection view). Reuses the existing query cache, so no extra requests, and updates live as the document loads.
- **Tidier title bar.** Left holds sidebar toggle + back/forward; the breadcrumb fills the center; view/search/settings controls stay right.

## [1.3.0] - 2026-06-08

### Features
- **Tabs.** Open multiple notes at once — each document gets a tab in a bar above the content; click to switch, ✕ or middle-click to close (auto-focuses a neighbour). Tabs track the document title/emoji as they load.
- **Back / forward navigation.** Added ← → buttons to the (previously sparse) title bar, using the router history.
- **Scroll-to-top button.** A floating button appears after scrolling down; click to smooth-scroll back to the top.

### Fixes
- **Edit controls stay visible.** The document header (title + 编辑/保存/星标/评论/历史) is now sticky at the top of the scroll area, so you no longer have to scroll back up to reach the action buttons mid-document.

## [1.2.0] - 2026-06-08

### Changes
- **Documents now open in the rendered read view, with an 编辑 button.** The live markdown editor mangled complex LaTeX (markdown treated `_{…}` as emphasis, ate backslashes), so display formulas like equation blocks showed raw and uncentered. Viewing now always uses the proven read pipeline (markdown-it + KaTeX): all math renders, block math is centered, tables are compact. Editing is one click away (TipTap), Esc/取消 leaves it, ⌘/Ctrl+S saves. This also avoids the round-trip corruption risk of editing math-heavy docs.
- **KaTeX lenient mode.** `strict:false` + `throwOnError:false` in both pipelines — silences the "Unicode text character used in math mode" warning (CJK punctuation in formulas) and never blanks a doc on a bad formula.
- **Right rail flush to the edge.** Document view switched to a 3-column grid (gutter · centered article · right rail); the table of contents / history / comments panel now sits against the right edge instead of floating mid-page.

## [1.1.1] - 2026-06-08

### Fixes
- **Block math now renders in the editor.** The Mathematics extension's default regex only matched inline `$...$`, so `$$block$$` display formulas showed as raw text in the (default) edit view. Extended the regex to match `$$…$$` too, and added an editor-load normalization that collapses multi-line `$$\n…\n$$` blocks onto a single line (skipping fenced code) so they land in one text node and render. Added styling for the rendered KaTeX / raw-source spans.
- **Compact tables.** Tables were stretched to 100% width with tall rows. Now content-width (`width:auto; max-width:100%`), cell padding reduced to 4px 10px, and paragraph margins inside cells removed — matching the web app's density. Applied to both read and edit views.

## [1.1.0] - 2026-06-08

### Features (web-parity)
- **LaTeX math.** `$inline$` and `$$block$$` formulas now render with KaTeX in both the read view (markdown-it-katex) and the editor (TipTap Mathematics extension, source text preserved for markdown round-trip). KaTeX fonts are bundled.
- **Selection toolbar.** Selecting text in the editor pops a bubble toolbar — bold, italic, strikethrough, inline code, H1/H2, quote, bullet list, and link.
- **Comments.** A comments panel (comments.list/create) on documents: read the thread and post new comments; available in both edit and read views.
- **Viewers (presence).** Recent-viewer avatars shown top-right of a document (views.list, refreshed every 30s). Note: this is the REST "who has viewed" list, the closest approximation to web's live websocket presence.

### Notes
- True real-time presence (live cursors) requires Outline's collaboration websocket and is out of scope for this REST client; the viewer avatars cover "who's been here recently."

## [1.0.1] - 2026-06-08

### Fixes
- **Full-width toggle now widens the document text.** The content column had its own 780px cap, so toggling full width only moved the table of contents. The cap is released in full-width mode.

### Features
- **Dark mode.** Theme selector in 设置 → 外观 (浅色 / 深色 / 跟随系统, persisted). Dark palette mirrors outline/outline `shared/styles/theme.ts` `buildDarkTheme` (background #111319, sidebar #08090C, link #137FFB, etc.), applied via `:root[data-theme="dark"]`; "跟随系统" tracks the OS `prefers-color-scheme`. Settings/search surfaces refactored to theme variables so they adapt.

## [1.0.0] - 2026-06-08

First tagged release. Cross-platform (macOS / Windows / Linux) Outline desktop client with interactive email (OTP) login, Outline-native theming, an Outline-style sidebar (team header, nav, starred + collections trees, account card), in-place TipTap editing with revision history and restore, stars, shares, home (recently viewed/updated), search, role-based permissions, a global full-width toggle, and a document table of contents. See 0.1.0–0.3.0 below for the full development history.

## [0.3.0] - 2026-06-08

### Features (web-parity pass)
- **Outline-native theme.** Global palette now mirrors outline/outline `shared/styles/theme.ts` light theme exactly (accent #0366d6, warmGrey sidebar #EDF2F7, almostBlack text #111319, hsl-based sidebar hover/active states, slim scrollbars, Inter font stack).
- **Sidebar rebuilt like the web app.** Team header, primary nav (搜索/主页/共享链接/设置), 星标 section (stars.list), collections section with the expandable tree, and a pinned account card at the bottom (avatar/name/email → settings).
- **In-place rich editing.** Split-pane markdown editor replaced by TipTap (ProseMirror — the same engine Outline uses) with two-way markdown conversion: click 编辑 and type directly in the document; title edits inline; ⌘/Ctrl+S saves, Esc cancels. Tables, task lists, images, links supported.
- **Stars.** Star/unstar button on documents (stars.create/delete); starred docs listed in the sidebar.
- **Shares view.** 共享链接 page lists public shares (shares.list) with copy-link.
- **Home view.** 最近查看 (documents.viewed) + 最近更新 (documents.list) with a greeting, like web Home.
- **Permissions.** Role from auth.info gates editing (viewer/guest hide the edit button); role badge shown in settings.
- **Avatar fix.** Server-relative avatar URLs are made absolute; avatar shown in sidebar account card and settings.
- **Generic API channel.** Whitelisted `api:call` IPC (stars/shares/documents.viewed/etc.) so new endpoints don't need bespoke handlers; API key still never leaves the main process.

### Notes
- TipTap markdown round-trip covers standard GFM; exotic Outline-specific embeds degrade to plain markdown on save.

## [0.2.0] - 2026-06-08

### Features
- **Expandable sidebar tree.** Collections expand in place (chevron) to a lazily-loaded, recursive document tree with per-node expand/collapse, emoji, and active highlight — mirroring the web sidebar.
- **Document editing.** Edit button opens a split markdown editor (textarea + live preview) with title editing; saves via `documents.update` and invalidates queries so the sidebar/title refresh.
- **Search wired up.** SearchView now calls `documents.search`; handles both the modern `{ranking, context, document}` result shape and older flat shapes; click-through to documents.
- **Account settings.** Settings shows the signed-in user (avatar/name/email/role via `auth.info`) and team name, plus server info and logout. UI translated to Chinese.

### Fixes
- **Window drag.** The titlebar's full-width left container was `no-drag`, making the bar undraggable — only buttons opt out now. The login screen (no titlebar) gets a top drag strip.

## [0.1.4] - 2026-06-08

### Fixes
- **"fetch failed" / "Client network socket disconnected before secure TLS connection was established".** Node's (undici/OpenSSL) TLS handshake to the server is cut mid-handshake on the user's network, while Chromium (BoringSSL) connects fine — consistent with TLS-fingerprint-based filtering by a middlebox/CDN. Fix: stop using Node fetch entirely in the main process.
  - `@outline/api-client` gains `setFetchImplementation()`; the main process injects Electron's `net.fetch`, so ALL API calls (collections, documents, verify, testConnection) ride Chromium's network stack.
  - The email auth handlers now use `session.fetch` with `credentials: "include"` — same session as the login window. The Chromium cookie jar handles Set-Cookie across redirects, so the `accessToken` is read from the jar after the callback (no manual Set-Cookie parsing), and CSRF uses the jar cookie + header echo. Failure notices are read from the final redirected URL.
  - `setCertificateVerifyProc` is applied to the default session for all auth flows (was only set inside browser login).

## [0.1.3] - 2026-06-08

### Fixes (verified against outline/outline server source)
- **Email send failed: missing CSRF.** All `/auth` routes verify a CSRF double-submit (`csrfToken` cookie issued on any GET + matching `x-csrf-token` header). `auth:requestEmailLogin` now GETs the site root first to obtain the cookie and echoes it on the POST.
- **Callback never signed in: missing `follow=true`.** The emailed link deliberately omits `follow` to defeat mail-client prefetching; without it the server returns a client-side redirect page and never creates a session. The exchange now always appends `follow=true`.
- **Browser login false-positive.** The old handler resolved on the first navigation that wasn't under `/auth/` — i.e. the login page itself — and saved junk cookies (e.g. `csrfToken`) as the API token, producing a "logged in but broken" state. Success is now defined solely by the appearance of a real `accessToken` session cookie (checked on navigation events + 2s poll); all junk fallbacks removed. The window also stays open and visible until actual sign-in.

### Features
- **OTP login.** `POST /auth/email` now sends `preferOTP: true` — the server emails a 6-digit verification code, which is far better desktop UX than copying a link. The second step accepts either the code (exchanged via `code`+`email`) or a pasted magic link (older servers without OTP support). New notices handled: `invalid-code`, `user-suspended`.

### Notes
- Full protocol (CSRF reject → CSRF success → OTP exchange → bad code → link exchange → expired link) covered by a mock-server test mirroring the real middleware.

## [0.1.2] - 2026-06-08

### Features
- **Interactive email (magic-link) login.** Outline's email login emails a one-time sign-in link; in a desktop app that link opens the *system browser*, so the session never reached the app — this is why interactive login was broken. New flow: enter your email in the app (`POST /auth/email`), then paste the emailed link back into the app; the main process performs the `GET /auth/email.callback?token=…` exchange itself (following same-origin redirects manually) and captures the `accessToken` Set-Cookie, a session JWT the Outline API accepts as a Bearer token. Handles `notice=expired-token`/`auth-error` redirects with friendly messages; accepts a full URL, a raw token, or a link embedded in copied text. The browser-window login remains as a fallback.
- **Cross-platform packaging.** Added electron-builder targets: macOS (dmg/zip), Windows (nsis/zip), Linux (AppImage/deb). `npm run dist:mac|win|linux` from the repo root.

### Fixes
- **Windows/Linux window chrome.** `titleBarStyle: "hiddenInset"` and `trafficLightPosition` are macOS-only; they are now applied conditionally so Windows/Linux get a normal native frame with working window controls. The in-app titlebar's 80px traffic-light inset is likewise macOS-only (platform exposed via preload `electronAPI.platform`).
- Moved root `electron` dep to devDependencies (packaging correctness).

### Notes & Caveats
- The emailed link is single-use and valid ~10 minutes; the UI warns users to copy (not click) it. If clicked in a browser first, the token is consumed and a new email must be sent.
- Callback exchange logic is covered by a mock-server test (redirect + Set-Cookie + notice paths). Live end-to-end test requires a real mailbox — run `npm run dev` and sign in with a registered email.
- `npm run lint` was already broken before this change (ESLint 9 flat-config file missing); typecheck passes.

## [0.1.1] - 2026-06-08

### Fixes
- **Critical: API transport never reached the server.** `transport.ts` passed a Node `https-proxy-agent` instance to undici `fetch`'s `dispatcher` option. undici only accepts an undici `Dispatcher`, so every API call threw `TypeError: fetch failed (cause: agent.dispatch is not a function)` — collections, documents, and connection tests all failed silently. Replaced with undici's `ProxyAgent` (used only when a proxy is configured).
- **Removed forced proxy routing.** The Outline server (`notes.jlu-mcns.site` → domestic IP) is directly reachable; routing it through the general-purpose proxy was unnecessary. Dropped the forced `http_proxy`/`https_proxy` env and the Chromium `--proxy-server` switch in the main process, and the per-session `setProxy` on the login window. The API transport now connects directly by default and only proxies when `OUTLINE_PROXY` is explicitly set.
- **Login window robustness.** Capture the post-login token on both `did-navigate` (OIDC redirect) and `did-navigate-in-page` (SPA client-side redirect), guarded by a single-settle flag.

### Design Rationale
- **Direct-by-default networking**: The server cert is a valid ZeroSSL/Sectigo chain whose root is simply absent from Node's/Chromium's bundled CA store — hence TLS verification is relaxed (`NODE_TLS_REJECT_UNAUTHORIZED=0` + `ignore-certificate-errors`) rather than proxied. A domestic host should not be forced through a (often foreign) proxy; `OUTLINE_PROXY` remains as an explicit opt-in escape hatch.

### Notes & Caveats
- TLS verification is globally disabled for the app. Acceptable for this self-hosted, trusted single-tenant deployment; revisit by adding the Sectigo root to a custom CA bundle if stricter verification is later required.
- Browser (email) login still requires the user to complete sign-in interactively in the popped window.

## [0.1.0] - 2026-05-27

### Features
- **Project foundation**: Monorepo with Electron 42 + React 19 + TypeScript 5 + Vite
- **IPC architecture**: Strict preload bridge with zod-validated handlers in main process
- **Profile management**: Add/remove/list Outline workspace connections with API key auth
- **Collection browser**: Sidebar tree + document list for browsing collections
- **Document viewer**: Full GFM markdown rendering with syntax highlighting (markdown-it + highlight.js)
- **Search view**: Global search UI shell (ready for API wiring)
- **Settings view**: Workspace management with add/remove profiles
- **Shared packages**: `@outline/shared-types`, `@outline/api-client` with typed RPC methods

### Design Rationale
- **Electron over Tauri**: Chosen for predictable Chromium runtime across platforms, critical for markdown editing consistency. Tauri's WebView variability and Rust requirement add risk for a macOS-first document-centric app.
- **Main-process API proxy**: All Outline API calls go through main process IPC handlers, keeping API keys out of the renderer. Security boundary is enforced via `contextIsolation`, `sandbox`, and typed preload methods.
- **TanStack Query + Zustand split**: Server state (collections, documents) managed by TanStack Query for cache lifecycle; UI state (sidebar, selection) in lightweight Zustand stores.
- **markdown-it over react-markdown**: Better parser control and GFM plugin ecosystem for desktop rendering pipeline.

### Notes & Caveats
- API keys are stored in a JSON file in userData (not keychain yet). Keychain integration planned for Phase 2.
- Offline caching, editing, tray, and mini-window are Phase 2-3 features.
- Windows/Linux support deferred to Phase 3.
