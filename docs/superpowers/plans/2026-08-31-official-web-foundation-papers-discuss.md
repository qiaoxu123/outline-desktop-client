# Official Web Foundation, Papers, and Discuss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `vendor/outline-web` the only functional renderer, connect it to the Electron desktop shell, and migrate the complete paper-library and discussion-board experience with the old implementation’s visual hierarchy.

**Architecture:** The official Web app owns routing, stores, API access, document navigation, theme, and UI primitives. Electron exposes a compatibility `DesktopBridge` through preload and routes authenticated API requests using an explicit active profile. Papers and Discuss are implemented as official Web scenes with focused data modules, shared navigation, and tests; the old renderer remains reference-only during this phase.

**Tech Stack:** Electron 42, React, TypeScript, MobX, React Router v5, styled-components, Outline Web `ApiClient`, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-31-official-web-full-migration-design.md`

## Global Constraints

- `vendor/outline-web` is the only product renderer; `apps/desktop/src/renderer` is reference-only and must not be loaded by Electron.
- Visual implementation must reuse Outline Web themes, spacing, primitives, lists, menus, dialogs, toasts, and responsive conventions.
- API keys remain in the Electron main process and secure profile storage; renderer code receives API results, never tokens.
- The protocol/API proxy must use an explicit active profile id and must not use `readProfiles()[0]`.
- Certificate validation must not be disabled globally with `setCertificateVerifyProc(... cb(0))`.
- Every task ends with a focused test command and a small commit.

## File Map

- Modify `apps/desktop/src/main/index.ts`: protocol handler, active-profile state, API proxy, window lifecycle.
- Modify `apps/desktop/src/preload/index.ts`: official `DesktopBridge` compatibility surface.
- Modify `apps/desktop/src/main/ipc/handlers/auth.ts`: profile-aware authentication and scoped TLS handling.
- Modify `apps/desktop/package.json`, root `package.json`, and `apps/desktop/scripts/prepare-official-web.mjs`: reproducible build entry points.
- Create `vendor/outline-web/app/desktop/bridge.ts`: typed wrapper for `window.DesktopBridge` and safe feature detection.
- Create `vendor/outline-web/app/stores/TabsStore.ts`: tab state, persistence, pinning, reordering, and close behavior.
- Create `vendor/outline-web/app/components/Tabs/TabBar.tsx` and styles: official-Web tab UI.
- Modify `vendor/outline-web/app/routes/authenticated.tsx`, `routes/scenes.ts`, and document navigation helpers: tab-aware routing.
- Replace `vendor/outline-web/app/scenes/Papers.tsx` and add `app/scenes/Papers/`: complete paper data, filters, metadata, graph, and interactions.
- Replace `vendor/outline-web/app/scenes/Discuss.tsx` and add `app/scenes/Discuss/`: complete forum data, composer, pins, comments, unread, likes, and views.
- Add focused tests under `vendor/outline-web/app/scenes/Papers/*.test.ts`, `vendor/outline-web/app/scenes/Discuss/*.test.ts`, and `vendor/outline-web/app/stores/TabsStore.test.ts`.

### Task 1: Restore a coherent workspace and reproducible official-Web build

**Files:**
- Modify: `package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/prepare-official-web.mjs`
- Modify: `vendor/outline-web/package.json` only if the build command needs an explicit exported script

**Interfaces:**
- Produces a root command that builds `vendor/outline-web`, then `apps/desktop`, then injects the official runtime environment.
- Produces a clean-checkout failure message when the official Web dependency is unavailable instead of silently using stale build output.

- [ ] Step 1: Inspect the current root lockfile/package relationship and write a failing shell-level assertion that the root exposes `build`, `typecheck`, and `test` commands.
- [ ] Step 2: Run `npm run build` at the repository root and record the current missing-script failure.
- [ ] Step 3: Restore the desktop workspace scripts without overwriting the official Web package metadata; make the build sequence explicit and preserve the existing lockfile’s dependency graph.
- [ ] Step 4: Update `prepare-official-web.mjs` to require the official Web build output generated in the same build invocation and inject only runtime placeholders.
- [ ] Step 5: Run `npm run typecheck`, `npm test`, and `npm run build`; expected result is success from a clean output directory.
- [ ] Step 6: Commit with `build: restore reproducible official web workspace`.

### Task 2: Connect the official Web runtime to Electron securely

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/ipc/handlers/auth.ts`
- Create: `vendor/outline-web/app/desktop/bridge.ts`
- Modify: `vendor/outline-web/app/utils/Desktop.ts`

**Interfaces:**
- `activeProfileId: string | null` is owned by the main process and set only after validating the profile id.
- `DesktopBridge` exposes official Web methods, while sensitive operations remain IPC-backed and token-free.
- The protocol API handler resolves the target server from the active profile and rejects requests when no active profile exists.

- [ ] Step 1: Add tests for profile selection rejecting unknown ids and for API proxy rejection when no active profile exists.
- [ ] Step 2: Run the focused tests and confirm failure before implementation.
- [ ] Step 3: Implement main-process active-profile IPC and replace every `readProfiles()[0]` call used by the protocol handler with the selected profile lookup.
- [ ] Step 4: Expose `DesktopBridge` from preload with official methods: platform/version, logout, host config, focus/blur, redirect, titlebar, notification, spellchecker, update no-ops, and navigation controls.
- [ ] Step 5: Implement the official Web bridge wrapper and update `Desktop.isElectron()` consumers to use it without assuming optional methods exist.
- [ ] Step 6: Remove `setCertificateVerifyProc(... cb(0))`; keep default verification and allow only the explicitly documented scoped certificate path if required by the configured server.
- [ ] Step 7: Run desktop typecheck, focused bridge tests, and a packaged startup smoke test; commit `feat: connect official web to secure desktop bridge`.

### Task 3: Add official-Web multi-tab navigation

**Files:**
- Create: `vendor/outline-web/app/stores/TabsStore.ts`
- Create: `vendor/outline-web/app/stores/TabsStore.test.ts`
- Create: `vendor/outline-web/app/components/Tabs/TabBar.tsx`
- Create: `vendor/outline-web/app/components/Tabs/TabBar.tsx` styles or colocated styled-components
- Modify: `vendor/outline-web/app/routes/authenticated.tsx`
- Modify: `vendor/outline-web/app/routes/scenes.ts`
- Modify: `vendor/outline-web/app/utils/routeHelpers.ts`
- Modify: document link/context-menu navigation modules

**Interfaces:**
- `Tab = { id: string; title: string; emoji?: string | null; url: string; pinned: boolean }`.
- `TabsStore.open(tab)`, `close(id)`, `closeOthers(id)`, `closeAll()`, `pin(id)`, and `move(id, beforeId)` are deterministic and persisted per profile.
- Internal document/share links open or focus a tab; external links use `DesktopBridge`/system browser behavior.

- [ ] Step 1: Write store tests covering open deduplication, active-tab selection after close, pinned-tab close protection, ordering, persistence, and profile isolation.
- [ ] Step 2: Run `npx vitest run app/stores/TabsStore.test.ts` and confirm failure.
- [ ] Step 3: Implement the store with profile-scoped persistence and route synchronization.
- [ ] Step 4: Implement `TabBar` using Outline Web primitives and theme variables; support click, close, pin context menu, middle-click, keyboard focus, and drag reorder.
- [ ] Step 5: Mount the bar in the authenticated shell without changing the official document layout or mobile breakpoint behavior.
- [ ] Step 6: Update internal navigation helpers and the Papers/Discuss entry points to use the tab store.
- [ ] Step 7: Run store/component tests and manually verify open/close/reorder on macOS-sized and narrow windows; commit `feat: add official web multi tab navigation`.

### Task 4: Migrate the paper library with old capability and official visual language

**Files:**
- Replace: `vendor/outline-web/app/scenes/Papers.tsx`
- Create: `vendor/outline-web/app/scenes/Papers/data.ts`
- Create: `vendor/outline-web/app/scenes/Papers/paperTree.ts`
- Create: `vendor/outline-web/app/scenes/Papers/PapersFilters.tsx`
- Create: `vendor/outline-web/app/scenes/Papers/PaperRow.tsx`
- Create: `vendor/outline-web/app/scenes/Papers/PaperGraph.tsx`
- Create: `vendor/outline-web/app/scenes/Papers/data.test.ts`
- Modify: `vendor/outline-web/app/routes/authenticated.tsx` only if route composition changes

**Interfaces:**
- `parsePaperMeta(text: string): PaperMeta` preserves tags, venue, paper URL, code URL, authors, organization, English title, updatedAt, urlId, and outLinks.
- `collectPapers(tree)` returns normalized entries with source collection/category and no duplicate document ids.
- `usePapersData()` returns `{ papers, filters, interactions, views, loading, error }` with cached/background-refresh behavior.

- [ ] Step 1: Port the pure parser/tree tests from `apps/desktop/src/renderer/features/papers/__tests__` and add cases for malformed metadata, code links, duplicate branches, and pagination.
- [ ] Step 2: Run the focused data tests and confirm failure for the new official-Web module.
- [ ] Step 3: Implement data loading through `ApiClient`, including recommendation/featured/internal-work collections, pagination, profile-scoped cache, and error states.
- [ ] Step 4: Implement the visual shell using official `Scene`, `PageLayout`, `Input`, `Button`, `Menu`, `Empty`, and themed styled-components; preserve the old information hierarchy of summary, filters, rows, metadata chips, and actions.
- [ ] Step 5: Add tag/year/category/search filters, sorting, recent-read and read-state behavior, paper/code links, and tab-aware document opening.
- [ ] Step 6: Add WebDAV/API-backed likes, ratings, view counts, and citation graph behind progressive loading so the first list paint is not blocked.
- [ ] Step 7: Run focused tests, official Web typecheck, and a manual visual pass in light/dark/narrow layouts; commit `feat: migrate paper library to official web`.

### Task 5: Migrate the discussion board with complete interaction flow

**Files:**
- Replace: `vendor/outline-web/app/scenes/Discuss.tsx`
- Create: `vendor/outline-web/app/scenes/Discuss/data.ts`
- Create: `vendor/outline-web/app/scenes/Discuss/DiscussHeader.tsx`
- Create: `vendor/outline-web/app/scenes/Discuss/TopicRow.tsx`
- Create: `vendor/outline-web/app/scenes/Discuss/TopicComposer.tsx`
- Create: `vendor/outline-web/app/scenes/Discuss/DiscussFilters.tsx`
- Create: `vendor/outline-web/app/scenes/Discuss/data.test.ts`
- Modify: `vendor/outline-web/app/routes/authenticated.tsx` only if route composition changes

**Interfaces:**
- `resolveDiscussCollection()` finds `论坛空间`/`讨论区`, creates the collection with `read_write` permission when allowed, and caches the id per profile.
- `useDiscussData()` returns categories, topics, reply activity, pin state, likes, views, unread state, loading, and error.
- Topic creation returns a document id and opens the new topic in a tab; replies use the official document comments flow.

- [ ] Step 1: Port tests for collection-name compatibility, category filtering, unread watermarks, pin deduplication, and activity sorting.
- [ ] Step 2: Run focused tests and confirm failure.
- [ ] Step 3: Implement collection resolution, paginated topic loading, category tree normalization, comments activity, pins, views, likes, and profile-scoped persistence.
- [ ] Step 4: Implement the old UI hierarchy with official primitives: header/actions, category filter, search, pinned section, topic rows with author/reply/view/unread metadata, and empty/error states.
- [ ] Step 5: Add composer validation, permission-aware create/delete actions, pin/unpin actions, and tab-aware topic opening; use official toast/notice handling.
- [ ] Step 6: Ensure topic detail reuses the official document and comments UI instead of creating a parallel reply editor.
- [ ] Step 7: Run focused tests, official Web typecheck, and manual create/pin/reply/unread checks; commit `feat: migrate discussion board to official web`.

### Task 6: Remove the old renderer’s duplicate product surface

**Files:**
- Delete after migration verification: `apps/desktop/src/renderer/features/papers/`
- Delete after migration verification: `apps/desktop/src/renderer/features/discuss/`
- Delete after migration verification: old desktop tab/activity-bar components that are no longer referenced
- Modify: `apps/desktop/src/renderer/App.tsx` and related package scripts only if stale references remain
- Modify: `CHANGELOG.md`

- [ ] Step 1: Run repository-wide `rg` to identify imports from the old papers/discuss/tab modules and add a no-import assertion to the migration checklist.
- [ ] Step 2: Remove only files proven unused by the official Web renderer and update tests that assert the old renderer’s navigation contract.
- [ ] Step 3: Update the changelog with the official-Web migration rationale, compatibility notes, and known follow-up phases.
- [ ] Step 4: Run root build, desktop typecheck, all tests, `git diff --check`, and inspect the packaged file list; commit `refactor: remove superseded desktop feature surfaces`.

## Follow-up Plans

After this plan passes its acceptance checks, create separate plans for:

- Personal notes/WebDAV migration
- Quiz and learning tools migration
- AI assistant and account/profile migration
- Shares, comments, attachments, and editor enhancements
- Final desktop polish, packaging, and cross-platform verification

## Final Verification

- [ ] Fresh checkout builds the official Web bundle and desktop app without pre-existing ignored build output.
- [ ] Official Web is the only renderer loaded by Electron.
- [ ] Login, logout, active profile selection, restart recovery, and profile isolation work.
- [ ] Tabs open, focus, close, pin, reorder, and persist per profile.
- [ ] Papers support the old metadata/filter/interaction/graph behavior with official Web styling.
- [ ] Discuss supports collection resolution, categories, create/delete, pins, replies, likes, views, and unread behavior with official Web styling.
- [ ] Light/dark/narrow layouts have no overflow, clipped controls, or visually inconsistent legacy cards.
