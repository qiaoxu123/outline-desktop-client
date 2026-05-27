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
