# Hybrid Official Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current active Outline Server’s official Web interface the primary document experience while keeping personal notes, papers, and discussion as local pages behind the fixed sidebar.

**Architecture:** Keep the existing local React shell and router. Add a main-process `WebContentsView` for the active Profile’s server, reserve a measured content rectangle in `AppShell`, and switch the view’s visibility based on a renderer-owned navigation mode. Local extension routes continue rendering through the existing `<Outlet>` and IPC APIs.

**Tech Stack:** Electron 42 `WebContentsView`, React 19, React Router, TypeScript, Electron IPC, Vitest, electron-vite.

**Spec:** `docs/superpowers/specs/2026-08-31-hybrid-official-web-design.md`

## Global Constraints

- Only the active Profile’s server origin may be loaded into the remote view.
- Do not inject scripts into or modify the official Web application.
- Keep `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true` for the local BrowserWindow.
- Do not pass API keys or Bearer tokens into the remote Web view.
- Local extensions must continue to use their existing IPC/API/WebDAV data paths.
- A remote loading failure must show a local retry state and must not switch to another Profile.

---

### Task 1: Add a typed remote-view state and IPC contract

**Files:**
- Create: `apps/desktop/src/main/remoteWebView.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/src/main/__tests__/remoteWebView.test.ts`

**Interfaces:**
- Produces `RemoteWebViewManager` with `attach(window)`, `setState(state)`, `setBounds(bounds)`, `setProfile(serverUrl)`, `retry()`, and `dispose()` methods.
- Produces preload methods `remoteWeb.setState`, `remoteWeb.setBounds`, `remoteWeb.setProfile`, and `remoteWeb.retry`.
- IPC state shape: `{ mode: "official" | "local"; serverUrl?: string; bounds?: { x: number; y: number; width: number; height: number } }`.

- [ ] **Step 1: Write failing manager tests**

Test that the manager rejects non-HTTP(S) URLs, hides the view in `local` mode, creates one `WebContentsView` for `official` mode, and updates bounds without creating a second view. Mock Electron’s `WebContentsView` and `BrowserWindow` rather than launching Electron.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npm test -- src/main/__tests__/remoteWebView.test.ts` from `apps/desktop`.

Expected result: FAIL because `remoteWebView.ts` and its manager contract do not exist.

- [ ] **Step 3: Implement the manager**

Create one `WebContentsView` per main window. Configure its web preferences with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; load only a normalized `serverUrl`; use `setBounds` for the reserved content rectangle; call `setVisible(false)` for local routes and `setVisible(true)` for official mode. Attach `did-fail-load` and `did-finish-load` listeners so the manager exposes `retry()` and does not silently navigate to another server.

- [ ] **Step 4: Register IPC handlers and preload wrappers**

Register `remote-web:set-state`, `remote-web:set-bounds`, `remote-web:set-profile`, and `remote-web:retry` in `index.ts`. Validate payloads in the main process with URL parsing and positive finite bounds before forwarding them to the manager. Add matching methods to `ElectronAPI` and `window.electronAPI` in the preload.

- [ ] **Step 5: Run focused tests and static checks**

Run `npm test -- src/main/__tests__/remoteWebView.test.ts`, `npm run typecheck`, and `npm run lint` from `apps/desktop`.

Expected result: all focused tests pass and no type/lint errors are reported.

- [ ] **Step 6: Commit the isolated desktop-view contract**

```bash
git add apps/desktop/src/main/remoteWebView.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/__tests__/remoteWebView.test.ts
git commit -m "feat: add isolated official web view bridge"
```

### Task 2: Add the local layout host and route switching

**Files:**
- Create: `apps/desktop/src/renderer/components/officialWeb/OfficialWebHost.tsx`
- Create: `apps/desktop/src/renderer/components/officialWeb/officialWebRoute.ts`
- Modify: `apps/desktop/src/renderer/components/layout/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/components/layout/AppShell.css`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Test: `apps/desktop/src/renderer/components/officialWeb/__tests__/officialWebRoute.test.ts`

**Interfaces:**
- `officialWebRoute.ts` exports `OFFICIAL_WEB_ROUTE = "/official"`, `isLocalExtensionRoute(pathname)`, and `isOfficialWebRoute(pathname)`.
- `OfficialWebHost` accepts `{ serverUrl: string; active: boolean }` and renders a full-size placeholder while synchronizing its `getBoundingClientRect()` to `electronAPI.remoteWeb.setBounds`.

- [ ] **Step 1: Write route classification tests**

Cover `/official`, `/notes`, `/papers`, `/discuss`, `/quiz`, `/settings`, `/document/:id`, `/collection/:id`, and `/search`. Assert that only `/official` is the remote route and the three requested extensions remain local.

- [ ] **Step 2: Run focused route tests and verify they fail**

Run `npm test -- src/renderer/components/officialWeb/__tests__/officialWebRoute.test.ts`.

Expected result: FAIL because the route module does not exist.

- [ ] **Step 3: Implement the host and geometry synchronization**

Render an `official-web-host` div in the main content area. On mount and on `ResizeObserver`/window resize, send its content-relative rectangle through the preload bridge. Send `remoteWeb.setState({ mode: "official" })` when active and `mode: "local"` when inactive. Keep the host in the layout so the local sidebar and content dimensions remain stable.

- [ ] **Step 4: Add the official route**

Add `<Route path="/official" element={<OfficialWebHost ... />} />`. Derive the current Profile server URL from `useProfileStore` and pass it to the host. Make `/official` the post-login default route without changing the existing local extension route components.

- [ ] **Step 5: Add loading/error/retry presentation**

Have the host show a local status overlay for `loading`, `failed`, and `ready` messages received through the bridge. The retry button invokes `remoteWeb.retry()`; it never changes the Profile or falls back to a different URL.

- [ ] **Step 6: Run tests and static checks**

Run `npm test -- src/renderer/components/officialWeb/__tests__/officialWebRoute.test.ts`, `npm run typecheck`, and `npm run lint` from `apps/desktop`.

- [ ] **Step 7: Commit the layout integration**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/components/layout/AppShell.tsx apps/desktop/src/renderer/components/layout/AppShell.css apps/desktop/src/renderer/components/officialWeb
git commit -m "feat: embed official web in the app shell"
```

### Task 3: Convert the sidebar to the hybrid navigation

**Files:**
- Modify: `apps/desktop/src/renderer/components/sidebar/activityBarOrder.ts`
- Modify: `apps/desktop/src/renderer/components/sidebar/SidebarNav.tsx`
- Modify: `apps/desktop/src/renderer/components/sidebar/ActivityBar.tsx`
- Modify: `apps/desktop/src/renderer/components/sidebar/Sidebar.tsx`
- Test: `apps/desktop/src/renderer/components/sidebar/__tests__/hybridNavigation.test.ts`

**Interfaces:**
- Sidebar navigation emits `/official` for the official Web entry and keeps `/notes`, `/papers`, and `/discuss` as local routes.
- Existing collection/document/search entries that are part of the primary Outline experience point to `/official` with a remote path handoff rather than rendering the local replacement page.

- [ ] **Step 1: Write failing navigation tests**

Assert that the fixed entries are labeled “官方文档”, “个人笔记”, “论文库”, and “讨论区”; the three local entries navigate to their existing paths; the official entry navigates to `/official`; and the active state is derived from the current route.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npm test -- src/renderer/components/sidebar/__tests__/hybridNavigation.test.ts`.

Expected result: FAIL because the current activity entries do not define the hybrid navigation contract.

- [ ] **Step 3: Implement fixed hybrid entries**

Add a non-removable official Web entry and preserve the three local entries. Keep existing visibility/order persistence for optional tools, but make the four primary entries visible by default and ensure the local routes never accidentally enter the remote view.

- [ ] **Step 4: Route primary document actions to the official view**

Update sidebar collection/document/search actions to navigate to `/official` and pass the intended Outline path through a validated route state or query parameter. The remote view manager may navigate only within the active Profile origin; it must reject external targets.

- [ ] **Step 5: Run focused tests and static checks**

Run `npm test -- src/renderer/components/sidebar/__tests__/hybridNavigation.test.ts`, `npm run typecheck`, and `npm run lint` from `apps/desktop`.

- [ ] **Step 6: Commit navigation behavior**

```bash
git add apps/desktop/src/renderer/components/sidebar/activityBarOrder.ts apps/desktop/src/renderer/components/sidebar/SidebarNav.tsx apps/desktop/src/renderer/components/sidebar/ActivityBar.tsx apps/desktop/src/renderer/components/sidebar/Sidebar.tsx apps/desktop/src/renderer/components/sidebar/__tests__/hybridNavigation.test.ts
git commit -m "feat: add hybrid official web navigation"
```

### Task 4: Handle Profile switching, navigation security, and failure states

**Files:**
- Modify: `apps/desktop/src/main/remoteWebView.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/renderer/components/officialWeb/OfficialWebHost.tsx`
- Modify: `apps/desktop/src/renderer/components/officialWeb/officialWebRoute.ts`
- Test: `apps/desktop/src/main/__tests__/remoteWebViewSecurity.test.ts`

**Interfaces:**
- `RemoteWebViewManager.setProfile(serverUrl)` hides the view, clears the prior page, and loads only the new normalized origin.
- `RemoteWebViewManager.navigate(path)` resolves a path against the active origin and rejects a different origin, credentials, or unsupported protocol.

- [ ] **Step 1: Write failing security and lifecycle tests**

Cover rejecting `javascript:`, `file:`, credentials in URLs, and another origin; hiding the old view during Profile changes; preserving the current page when toggling local/official mode; and retrying the last valid URL after a load failure.

- [ ] **Step 2: Run focused tests and verify they fail**

Run `npm test -- src/main/__tests__/remoteWebViewSecurity.test.ts`.

Expected result: FAIL because the lifecycle and origin checks are not implemented.

- [ ] **Step 3: Implement origin validation and lifecycle handling**

Normalize each server URL to its origin, reject credentials and non-HTTP(S) protocols, compare every requested target with the active origin, and destroy the old `WebContentsView` before loading a new Profile. Emit status events to the renderer for `loading`, `ready`, and `failed`.

- [ ] **Step 4: Implement renderer retry and stale-state protection**

Ignore status events whose Profile origin no longer matches the active Profile. Disable retry while a request is in flight and restore it only after a failed load. Preserve the last successful remote URL while local extension pages are displayed.

- [ ] **Step 5: Run the full verification suite**

Run from `apps/desktop`:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected result: all tests pass, TypeScript and ESLint pass, and electron-vite creates a production build.

- [ ] **Step 6: Commit security and lifecycle handling**

```bash
git add apps/desktop/src/main/remoteWebView.ts apps/desktop/src/main/index.ts apps/desktop/src/renderer/components/officialWeb apps/desktop/src/main/__tests__/remoteWebViewSecurity.test.ts
git commit -m "fix: secure official web profile switching"
```

### Task 5: Package and verify the hybrid client

**Files:**
- Modify: `CHANGELOG.md` only if the repository’s release policy classifies this as a version-level feature.
- No product source changes are allowed in this task.

- [ ] **Step 1: Build the macOS directory package**

Run `NODE_TLS_REJECT_UNAUTHORIZED=0 npx electron-builder --mac --dir` from `apps/desktop` only if the normal command fails with the known local certificate-chain error. Do not persist this environment variable in shell configuration or project files.

- [ ] **Step 2: Verify the packaged resources**

Confirm the production package contains the new remote-view manager and preload bridge, and run `codesign --verify --deep --strict` against the packaged app.

- [ ] **Step 3: Install with a recoverable backup**

Quit the running app, move the existing `/Applications/Outline Desktop.app` to a timestamped `.previous` backup, copy the new app with `ditto`, and compare the installed `Contents/Resources/app.asar` SHA-256 with the built package before launching it.

- [ ] **Step 4: Verify the user-visible contract without changing official code**

Check that the installed client starts on the official Web route, that the three fixed sidebar entries remain local, and that switching between them does not change the active Profile. Record any network/authentication limitation separately from source test results.

- [ ] **Step 5: Report exact verification results**

Report the installed package hash, test/typecheck/lint/build results, backup path, and any limitation caused by server login or network availability.
