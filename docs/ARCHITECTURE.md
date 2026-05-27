# Outline Desktop Client Architecture

## 1. Scope And Design Goals

This document defines the target architecture for a desktop client for Outline, an open-source collaborative knowledge base built with React and Node.js.

Primary release order:

1. macOS first
2. Windows second
3. Linux third

Primary design goals:

- Fast read path for collections and documents
- Reliable editing for markdown-heavy documents
- Strong desktop-native behavior for profiles, tray access, and caching
- Predictable security boundaries around API keys and local data
- Low-friction future support for Windows and Linux

Non-goals for the first implementation:

- Real-time multiplayer editing parity with the web app
- Full admin/workspace settings coverage
- Plugin ecosystem
- Custom rendering of every proprietary Outline editor block on day one

## 2. Technology Choice: Electron Vs Tauri

The shell decision matters more than any other desktop choice because it constrains editor behavior, update mechanics, OS integration, packaging, testability, and how much runtime variance the team must absorb.

### Decision Summary

Recommendation: **Electron for v1 through v3**.

Re-evaluate Tauri only after:

- macOS product-market fit is proven
- the read/edit pipeline is stable
- packaging and updater workflows are mature
- Linux support requirements are concrete rather than aspirational

### Current Baselines

- Electron release schedule shows `42.0.0` stable on **May 5, 2026**, `43.0.0` stable on **June 30, 2026**, and `44.0.0` planned for **August 25, 2026**.
- Electron 42 uses Chromium `148` and Node.js `24.15.0` per the official schedule.
- Tauri 2 official docs show the 2.x line is active, with recent `tauri` crate releases including `2.11.2` in the release index.
- Tauri 2 uses `WKWebView` on macOS, `WebView2` on Windows, and `webkit2gtk` on Linux.

### Option Table

| Criterion | Electron | Tauri 2 |
| --- | --- | --- |
| Runtime model | Bundled Chromium + Node | System webview + Rust core |
| Web feature consistency | High across platforms | Varies by OS webview |
| Native integration maturity | Excellent | Good and improving |
| Startup/bundle size | Heavier | Lighter |
| JS-only team fit | Strong | Medium |
| Security defaults | Good with discipline | Strong capability model |
| Editor predictability | Very high | High on macOS, more variable cross-platform |
| OS packaging complexity | Moderate | Moderate to high |
| Team skill requirements | TS/JS | TS/JS + Rust |
| Linux support variance | Lower | Higher because of GTK/WebKit environment |

### Electron Pros

| Advantage | Why it matters here |
| --- | --- |
| Single Chromium runtime | Markdown editor, preview, search UI, and mini window behave consistently across platforms |
| Mature tray/window APIs | Required for quick access, mini window, and multi-window orchestration |
| Node in main process | Straightforward SQLite, file IO, secure keychain adapters, updater integration |
| Ecosystem maturity | More examples and battle-tested patterns for desktop knowledge apps |
| Better fit for macOS-first shipping | Faster path to a polished MVP without adding Rust staffing cost |

### Electron Cons

| Cost | Mitigation |
| --- | --- |
| Larger app bundle | Accept for v1; optimize later with code splitting and stripped dev tools |
| Higher memory footprint | Keep single primary renderer and lightweight auxiliary windows |
| Security footguns if misconfigured | Enforce `contextIsolation`, sandboxing, preload-only IPC, strict CSP |

### Tauri Pros

| Advantage | Why it matters |
| --- | --- |
| Smaller binaries | Better distribution footprint |
| Strong capability and permission model | Cleaner default security story |
| Native-feeling shell | Good long-term candidate for a slimmer desktop app |

### Tauri Cons

| Cost | Why it is a blocker now |
| --- | --- |
| Rust core required | Increases staffing and maintenance burden immediately |
| Webview variance | Riskier for markdown editing and syntax highlighting consistency |
| Linux platform differences | Harder to guarantee polish in a document-centric app |
| Plugin maturity differences | More design effort for updater, tray, and desktop workflow edge cases |

### Recommendation Rationale

Electron wins because the product’s hardest problems are not binary size. They are:

- reliable markdown editing
- consistent rendering
- secure profile management
- offline cache correctness
- desktop-native quick access

Electron minimizes uncertainty in exactly those areas. For a macOS-first app that will later add Windows and Linux, consistent runtime behavior is more valuable than a smaller installer.

### Shell Baseline

Adopt:

- Electron `42.x` baseline for initial architecture
- React `19`
- TypeScript `5.x`
- Vite for renderer builds

Do not target the absolute latest Electron major on day one. Pin to the newest supported major that has cleared initial ecosystem breakage and roll forward on a regular cadence.

## 3. Project Directory Structure

Recommended monorepo layout:

```text
outline-desktop-client/
  README.md
  docs/
    ARCHITECTURE.md
    IMPLEMENTATION_PLAN.md
  apps/
    desktop/
      package.json
      electron.vite.config.ts
      src/
        main/
          app.ts
          windows/
            mainWindow.ts
            miniWindow.ts
          tray/
            trayController.ts
          ipc/
            channels.ts
            validators.ts
            handlers/
              profiles.ts
              collections.ts
              documents.ts
              search.ts
              cache.ts
              attachments.ts
          services/
            outlineApi/
              transport.ts
              auth.ts
              endpoints/
                collections.ts
                documents.ts
                attachments.ts
            storage/
              db.ts
              migrations/
              repositories/
            keychain/
              secrets.ts
            sync/
              scheduler.ts
              conflictResolver.ts
            telemetry/
              logger.ts
          workers/
            searchIndexer.ts
            cachePruner.ts
        preload/
          index.ts
          api/
            profiles.ts
            collections.ts
            documents.ts
            search.ts
            shell.ts
        renderer/
          main.tsx
          app/
            App.tsx
            routes.tsx
            providers/
          components/
            layout/
            sidebar/
            document/
            search/
            settings/
            tray/
          features/
            profiles/
            collections/
            documents/
            editor/
            search/
            cache/
          hooks/
          state/
            uiStore.ts
            sessionStore.ts
          queries/
          lib/
            markdown/
            formatting/
            keyboard/
          styles/
  packages/
    shared-types/
      src/
        api.ts
        entities.ts
        ipc.ts
        sync.ts
    api-client/
      src/
        methods.ts
        schemas.ts
        errors.ts
    ui/
      src/
        primitives/
        theme/
  tooling/
    scripts/
    configs/
```

### Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `apps/desktop/src/main` | OS integration, window lifecycle, IPC handlers, storage, background sync |
| `apps/desktop/src/preload` | Narrow bridge from renderer to approved desktop APIs |
| `apps/desktop/src/renderer` | UI, state management, editor, preview, search views |
| `packages/shared-types` | Shared contracts used by main, preload, and renderer |
| `packages/api-client` | Typed Outline RPC client and request/response schemas |
| `packages/ui` | Reusable view primitives and desktop theme tokens |

## 4. Process Model: Main Vs Renderer Vs Workers

### Main Process

Responsibilities:

- application bootstrap
- profile registry
- API key access via OS keychain adapter
- SQLite lifecycle and migrations
- IPC request handling
- tray and global shortcut registration
- window creation and focus policy
- sync scheduling
- background attachment downloads if enabled

The main process owns all privileged capabilities.

### Renderer Process

Responsibilities:

- visible desktop UI
- navigation
- collection browsing
- document reading and editing
- optimistic UI for edits
- search interactions
- offline/online indicators

The renderer does not directly access Node or local secrets.

### Worker Threads / Utility Processes

Use workers for CPU-heavy or latency-sensitive background tasks:

- local search indexing over cached documents
- markdown pre-rendering for preview cache
- cache pruning and compression
- attachment checksum or dedup work

Keep workers stateless where practical. The main process should schedule and supervise them.

### Window Model

Initial windows:

1. Main window
2. Mini window

Optional later:

3. Detached document window
4. Authentication/help window for onboarding flows

Do not make each document its own renderer in v1. A single main renderer plus a lightweight mini renderer keeps state coordination simpler.

## 5. IPC Design: Channels, Contracts, Security

### IPC Principles

- renderer never receives raw `ipcRenderer`
- all IPC channels are request-scoped and typed
- every payload validated at runtime with `zod`
- sender validation enforced in main handlers
- no generic `invoke("api", any)` escape hatch

### IPC Channel Families

| Channel | Direction | Purpose |
| --- | --- | --- |
| `profiles:list` | renderer -> main | List saved server profiles |
| `profiles:create` | renderer -> main | Add server profile metadata and keychain secret |
| `profiles:update` | renderer -> main | Update display name, server URL, scopes metadata |
| `profiles:delete` | renderer -> main | Remove profile and optionally local cache |
| `profiles:testConnection` | renderer -> main | Validate server URL and token |
| `collections:list` | renderer -> main | Fetch and cache available collections |
| `collections:documents` | renderer -> main | Fetch document list for a collection |
| `documents:info` | renderer -> main | Fetch single document detail |
| `documents:update` | renderer -> main | Save document changes |
| `documents:create` | renderer -> main | Create new document |
| `documents:delete` | renderer -> main | Delete or archive document |
| `documents:prefetch` | renderer -> main | Warm cache for likely next reads |
| `search:remote` | renderer -> main | Call Outline search endpoint |
| `search:local` | renderer -> main | Search offline index |
| `cache:status` | renderer -> main | Report cache stats and sync state |
| `cache:pinDocument` | renderer -> main | Mark document for persistent offline retention |
| `attachments:list` | renderer -> main | Fetch attachment metadata |
| `attachments:create` | renderer -> main | Create attachment record before upload |
| `window:showMini` | renderer -> main | Open or focus mini window |
| `window:setBadge` | renderer -> main | macOS dock/taskbar badge behavior |
| `app:getVersion` | renderer -> main | About/settings surfaces |

### Contract Shape

All invoke channels should share a normalized envelope:

```ts
type IpcRequest<T> = {
  requestId: string;
  profileId?: string;
  payload: T;
};

type IpcResponse<T> = {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
```

### Security Controls

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- strict Content Security Policy
- preload exposes narrow methods only
- input schema validation on both preload and main boundary
- sender origin and frame verification
- block arbitrary navigation and `window.open`
- never expose filesystem or shell primitives unless individually wrapped

Electron’s official security guidance explicitly recommends context isolation and process sandboxing. Context isolation has been enabled by default since Electron 12, and renderer sandboxing since Electron 20.

## 6. State Management Strategy

Use a split model:

- **TanStack Query 5** for server state
- **Zustand 5** for app/session/UI state
- **CodeMirror transaction state** for editor-local ephemeral state

### Why This Split

| State kind | Tool | Reason |
| --- | --- | --- |
| API-derived collections/documents/search results | TanStack Query | Cache lifecycle, stale policies, background refetch, retries |
| Current profile, sidebar collapse, selected collection, mini-window prefs | Zustand | Small, explicit, low ceremony |
| In-flight editor buffer, selection, undo history | CodeMirror internals | Best kept close to editor model |

### Query Key Conventions

Examples:

- `["profile", profileId, "collections"]`
- `["profile", profileId, "collection", collectionId, "documents", page]`
- `["profile", profileId, "document", documentId]`
- `["profile", profileId, "search", query, scope]`

### State Ownership Rules

- Remote truth lives in Query cache and SQLite cache.
- UI selection lives in Zustand.
- Unsaved editor content lives in editor memory first, then draft table in SQLite.
- Main process is the source of truth for profile registry, keychain state, cache policy, and sync queue.

## 7. Component Tree: Full UI Hierarchy

```text
AppShell
  DesktopProviders
    ErrorBoundary
    QueryProvider
    ThemeProvider
    Router
      RootLayout
        TitleBar
          WindowControls
          ProfileSwitcher
          GlobalSearchButton
          SyncStatusIndicator
          SettingsButton
        MainPane
          SidebarLayout
            Sidebar
              SidebarHeader
                WorkspaceIdentity
                NewDocumentButton
              SidebarSections
                CollectionTree
                  CollectionTreeNode
                    CollectionExpandToggle
                    CollectionLabel
                    CollectionUnreadBadge
                PinnedDocumentsSection
                RecentDocumentsSection
                OfflineDocumentsSection
              SidebarFooter
                StorageUsageIndicator
                ConnectionStatus
            ContentArea
              Route: CollectionView
                CollectionToolbar
                  Breadcrumbs
                  SortMenu
                  FilterMenu
                  RefreshButton
                DocumentListPanel
                  DocumentListHeader
                  DocumentList
                    DocumentListRow
                      DocumentIcon
                      DocumentTitle
                      DocumentExcerpt
                      UpdatedAt
                      AuthorAvatar
                      OfflineBadge
              Route: DocumentView
                DocumentScreen
                  DocumentHeader
                    Breadcrumbs
                    DocumentTitle
                    DocumentMeta
                    ModeToggle
                    SaveStatus
                    MoreActionsMenu
                  DocumentBody
                    ReadMode
                      MarkdownRenderer
                        CodeBlock
                        TableBlock
                        TaskListBlock
                        CalloutBlock
                        AttachmentBlock
                    EditMode
                      EditorToolbar
                        FormattingGroup
                        InsertGroup
                        CodeLanguagePicker
                      MarkdownEditor
                      EditorFooter
                        WordCount
                        CursorPosition
                        DraftStatus
                  DocumentSidebar
                    OutlineToc
                    BacklinksSummary
                    AttachmentsPanel
              Route: SearchView
                SearchScreen
                  SearchInput
                  SearchScopeTabs
                  SearchModeToggle
                  SearchResults
                    SearchResultGroup
                      SearchResultRow
              Route: SettingsView
                SettingsScreen
                  ProfilesSettings
                  CacheSettings
                  KeyboardShortcutsSettings
                  AppearanceSettings
                  AboutPanel
MiniWindowApp
  MiniWindowShell
    QuickSearchInput
    RecentDocumentsList
    FavoritesList
    ProfileQuickSwitcher
    OpenMainWindowButton
```

### UI Design Notes

- Keep the main app as a three-zone desktop layout: title/toolbar, navigation sidebar, content pane.
- Mini window is not a duplicate of the main app. It is a fast launcher and search surface.
- The editor should support keyboard-first workflows before adding dense floating controls.

## 8. Data Flow: API Layer, Caching Strategy, State Sync

### Outline API Layer

Outline’s public API documentation establishes:

- RPC-style API
- `POST /api/:method`
- JSON responses
- bearer token auth via `Authorization` header
- common `limit` / `offset` pagination on list methods

### API Client Design

Structure:

1. `transport.ts`
   - base URL normalization
   - headers
   - retries for safe reads
   - timeout and abort logic
2. `methods.ts`
   - typed wrappers for each supported RPC method
3. `schemas.ts`
   - response decoding and normalization
4. `errors.ts`
   - auth, rate-limit, not-found, validation, server errors

### Profile Isolation

Every request carries `profileId`, which resolves in main process to:

- base server URL
- auth secret from keychain
- per-profile SQLite namespace
- per-profile sync queue

Never let renderer assemble secrets or long-lived auth headers.

### Offline-First Strategy

The product requirement is “offline caching for recent documents,” not “full offline mirror.” The cache should therefore be selective rather than total.

Recommended tiers:

| Tier | Content | Policy |
| --- | --- | --- |
| Metadata cache | profiles, collections, document list summaries | eagerly cached |
| Hot document cache | recent/opened/pinned document bodies | LRU + pin support |
| Draft cache | unsaved local edits | persisted immediately |
| Search index cache | local inverted index over cached docs | background maintained |
| Attachment cache | metadata first, file bytes optional | opt-in or threshold based |

### Storage Choice: SQLite Vs IndexedDB

Recommendation: **SQLite in main process**.

| Option | Pros | Cons |
| --- | --- | --- |
| SQLite | robust queries, migrations, shared across windows, easier cache introspection, better for search metadata | native module dependency |
| IndexedDB | browser-native, no native module | harder cross-window ownership, weaker operational tooling, less suitable for main-process-centric sync |
| JSON files | simple | poor queryability, fragile concurrency, migration pain |

Use tables roughly like:

- `profiles`
- `collections`
- `documents`
- `document_content`
- `drafts`
- `search_index_jobs`
- `sync_queue`
- `attachments`
- `app_settings`

### Document Read Flow

1. Renderer requests `documents:info`.
2. Main checks local cache freshness.
3. If fresh enough, return cached payload immediately.
4. If online, revalidate in background and update Query cache.
5. If offline and cache exists, mark response as stale-but-available.
6. If offline and no cache exists, return offline miss.

### Document Edit Flow

1. Renderer opens edit mode with server snapshot plus local draft overlay if present.
2. Editor writes draft checkpoints to SQLite after debounce and on blur.
3. Save action sends `documents:update`.
4. Main records optimistic sync entry.
5. On success:
   - clear matching draft revision
   - update cached document body
   - invalidate related list/search queries
6. On failure:
   - keep draft
   - classify error as retryable/non-retryable
   - surface sync banner

### Search Flow

Two modes:

1. Remote search
   - source of truth when online
2. Local search
   - fallback over cached documents when offline

Behavior:

- default to remote when online
- show local cached hits immediately if available
- merge presentation carefully, but do not imply local results are complete server truth

### Sync Model

Use a pragmatic sync strategy, not CRDTs, for v1-v3:

- last successful server revision is the base
- local draft is an overlay
- save attempts push full markdown body
- if server has changed since cached revision, fetch latest and present conflict resolution UI

Conflict policy:

- read latest remote
- preserve local draft
- show diff/merge screen
- allow overwrite or manual merge

This is less ambitious than real-time collaborative editing but much safer for an early desktop client.

## 9. Key Technical Decisions And Rationale

### Editor Choice

Recommendation: **CodeMirror 6**

Alternatives considered:

| Editor | Pros | Cons |
| --- | --- | --- |
| CodeMirror 6 | excellent markdown editing, granular extension system, good performance, desktop-keyboard friendly | more assembly work than out-of-box rich editors |
| TipTap 3 | strong rich-text UX, ProseMirror ecosystem, good extensibility | better fit for WYSIWYG-first editing than raw markdown-first workflows |
| Monaco 0.55.x | powerful code editor, mature diff editor | heavy for prose editing, weaker markdown writing ergonomics |

Why CodeMirror 6 wins:

- The feature request is “full GFM markdown,” which implies markdown-first fidelity matters.
- Outline’s API and knowledge-base use case map naturally to markdown body editing rather than only structured rich text JSON.
- CodeMirror is leaner than Monaco and less semantically opinionated than TipTap.

Use Monaco only for an optional future diff/merge viewer if needed.

### Markdown Renderer Choice

Recommendation: **markdown-it**

Alternatives considered:

| Renderer | Pros | Cons |
| --- | --- | --- |
| markdown-it | fast, extensible, mature GFM plugin ecosystem | lower-level than unified stack |
| react-markdown 9.x | React-native composition, safe defaults | less ideal when you want parser control plus explicit render pipeline reuse |
| remark/unified | very powerful AST pipeline | more setup and cognitive load than needed here |
| marked | simple and fast | less extensibility discipline than markdown-it/unified |

Why markdown-it wins:

- easy GFM-oriented pipeline
- good fit for desktop preview rendering
- simple integration with syntax highlighting and custom block renderers

Recommended stack:

- `markdown-it`
- `markdown-it-task-lists`
- `markdown-it-footnote` if needed
- `highlight.js` or `shiki` for code blocks

Choose `highlight.js` first because it is simpler offline and lighter operationally. Revisit `shiki` only if theme fidelity becomes a requirement.

### Offline Storage Choice

Recommendation: **SQLite**

Already justified above, but the key reason is ownership. Desktop sync, cache, drafts, and search indexing belong in the privileged process, not in browser-local storage hidden inside a renderer sandbox.

### Window Management Approach

Recommendation:

- Electron main process owns all windows
- one persistent main window
- one on-demand mini window
- windows communicate through main-owned state and events, never renderer-to-renderer

Why:

- cleaner focus logic
- safer security model
- less duplicate API/auth/cache state

Mini window behavior:

- frameless or compact titled window depending on platform conventions
- always fast to open
- should restore prior query state only if that improves speed without confusion

## 10. Security Considerations

### Secret Handling

- Store API keys in Keychain Access on macOS, Credential Manager on Windows, Secret Service/libsecret on Linux.
- Store only profile metadata in SQLite or config.
- Never log bearer tokens.

### Content Security

- local app content only
- strict CSP with no remote script execution
- external links open via guarded shell wrapper
- sanitize rendered HTML from markdown plugins

### IPC Hardening

- explicit channel allowlist
- zod validation at boundaries
- sender verification
- no passthrough shell/file/network APIs

### Attachment Safety

- treat attachment downloads as untrusted
- write to app-managed cache directory
- open externally only after explicit user action
- never auto-execute downloaded files

### Network Safety

- HTTPS-only by default
- self-hosted HTTP allowed only behind explicit advanced setting with warning
- certificate failures surfaced clearly
- rate-limit and retry handling for Outline API

### Privacy

- local analytics disabled by default in MVP
- operational logs redact document content unless user enables debug capture
- local full-text index stays on device

### Supply Chain

- pin Electron major
- minimize native dependencies
- audit markdown and syntax-highlighting plugins
- sign releases for each platform

## 11. Open Questions And Planned Constraints

These are not blockers for writing code, but they should be settled before implementation:

1. Whether the desktop client edits canonical markdown bodies only, or must round-trip every Outline-specific rich element perfectly.
2. Whether attachment binary caching is mandatory in MVP or only metadata caching is required.
3. Whether document history/version restore is in scope or deferred.
4. Whether search should include local draft text in offline mode.
5. Whether the mini window needs a global shortcut on day one.

Current architectural assumption:

- canonical edit format is markdown text
- unsupported rich constructs degrade gracefully to source markdown or read-only warning

## 12. Recommended Initial Stack Snapshot

| Area | Recommendation |
| --- | --- |
| Desktop shell | Electron 42.x |
| UI | React 19 + TypeScript 5.x |
| Build | Vite + electron-vite |
| Server state | TanStack Query 5 |
| Local/UI state | Zustand 5 |
| Editor | CodeMirror 6 |
| Markdown preview | markdown-it + highlight.js |
| Storage | better-sqlite3 + SQLite |
| Validation | zod |
| Styling | CSS variables + modular component styles or Tailwind only if the team already prefers it |
| Testing | Vitest, Playwright, and focused desktop integration tests |

## 13. Final Recommendation

Build the first three phases on Electron with a markdown-first editor architecture, main-process-owned SQLite cache, and a strict preload IPC boundary.

That combination best matches:

- Outline’s RPC API model
- the macOS-first requirement
- the offline recent-doc requirement
- the tray and mini-window requirement
- the need for predictable cross-platform behavior later

The most important architectural constraint is to keep privilege centralized in the main process while keeping renderer state explicit and replaceable. If that boundary stays clean, the client can grow from a macOS MVP into a credible cross-platform desktop product without a structural rewrite.

## 14. Sources

- Outline repo: <https://github.com/outline/outline>
- Outline API guide: <https://docs.getoutline.com/s/guide/doc/api-1rEIXDfLF6>
- Outline OpenAPI repo: <https://github.com/outline/openapi>
- Electron release schedule: <https://releases.electronjs.org/schedule>
- Electron context isolation: <https://www.electronjs.org/docs/latest/tutorial/context-isolation>
- Electron security: <https://www.electronjs.org/docs/tutorial/security/>
- Electron sandboxing: <https://www.electronjs.org/docs/latest/tutorial/sandbox/>
- Tauri capabilities: <https://v2.tauri.app/security/capabilities/>
- Tauri webview versions: <https://v2.tauri.app/reference/webview-versions/>
- Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>
- CodeMirror changelog: <https://codemirror.net/docs/changelog/>
- Tiptap overview: <https://tiptap.dev/docs/editor/getting-started/overview>
- Tiptap markdown docs: <https://tiptap.dev/docs/editor/markdown/getting-started>
- Monaco docs: <https://microsoft.github.io/monaco-editor/>
- react-markdown releases: <https://github.com/remarkjs/react-markdown/releases>
