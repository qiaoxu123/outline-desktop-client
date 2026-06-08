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
