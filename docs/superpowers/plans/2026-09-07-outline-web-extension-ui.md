# Outline Web Extension UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the official Outline Web extension’s tabs, paper library, and discussion area feel native to Outline while preserving existing data and navigation behavior.

**Architecture:** Keep vendor/outline-web as the only product renderer. Improve the existing TabsStore/openInTab flow, then refine Papers and Discuss with official Web components and theme tokens. Keep data fetching and storage contracts stable; extract only small pure helpers that make behavior testable.

**Tech Stack:** React 17, TypeScript, MobX, styled-components, React Router 5, Outline Web components/theme tokens, Vitest.

**Spec:** docs/superpowers/specs/2026-09-07-outline-web-extension-ui-design.md

## Global Constraints

- Official Web is the only visual source: reuse Scene, Header, Button, ButtonSmall, InputSearch, Empty, official icons, theme tokens, and existing menu patterns.
- Do not restore or modify the old apps/desktop/src/renderer product routes for this feature.
- Do not add a second BrowserWindow, WebContentsView, HashRouter, document editor, server API, or data format.
- Preserve existing localStorage keys, WebDAV path 论文库/interactions.json, team-scoped tab state, paper metadata cache, reading history, and interaction behavior.
- Every document opened from Papers or Discuss must go through openInTab(history, tabs, tab).
- Run tests first for each behavior change, then implement the smallest passing change and keep existing workspace changes intact.

## File Map

- vendor/outline-web/app/components/Tabs/TabBar.tsx: tab strip, tab semantics, close/pin actions, drag feedback, and context menu.
- vendor/outline-web/app/stores/TabsStore.ts: team-scoped tab persistence and mutations; change only when a test demonstrates a missing invariant.
- vendor/outline-web/app/utils/tabNavigation.ts: stable document identity and the single document-open entry point.
- vendor/outline-web/app/scenes/Papers.tsx: paper data orchestration and official-style page composition.
- vendor/outline-web/app/scenes/Discuss.tsx: discussion data orchestration and official-style page composition.
- vendor/outline-web/app/scenes/PapersHelpers.ts: pure paper filtering/sorting helpers if extraction makes tests smaller.
- vendor/outline-web/app/scenes/DiscussHelpers.ts: pure discussion filtering/grouping helpers if extraction makes tests smaller.
- vendor/outline-web/app/scenes/PapersHelpers.test.ts: paper helper behavior tests.
- vendor/outline-web/app/scenes/DiscussHelpers.test.ts: discussion helper behavior tests.
- vendor/outline-web/app/utils/tabNavigation.test.ts and vendor/outline-web/app/stores/TabsStore.test.ts: tab behavior tests.
- CHANGELOG.md: version-level UI refresh entry after all three areas are complete.

---

### Task 1: Complete the official Web tab experience

**Files:**
- Modify: vendor/outline-web/app/components/Tabs/TabBar.tsx
- Modify: vendor/outline-web/app/stores/TabsStore.ts only if an invariant is missing
- Modify: vendor/outline-web/app/utils/tabNavigation.ts only if tests require it
- Test: vendor/outline-web/app/stores/TabsStore.test.ts
- Test: vendor/outline-web/app/utils/tabNavigation.test.ts

**Interfaces:**
- Consumes: TabsStore.tabs, open, update, close, togglePin, move, closeOthers, closeAll, documentTabId, and openInTab.
- Produces: a tablist whose tabs switch through openInTab, independent close controls for non-pinned tabs, a context menu for pin/close actions, and drag feedback constrained to the same pinned group.

- [x] Step 1: Write the failing identity and duplicate tests.
  Add cases proving that /doc/abc and /doc/abc/edit share one identity while /doc/abc/history/rev is not treated as edit mode. Add a store test that opening ordinary and edit URLs leaves one /doc/abc tab.
- [x] Step 2: Run the focused tests and verify the expected failure.
  From vendor/outline-web run: yarn vitest run app/utils/tabNavigation.test.ts app/stores/TabsStore.test.ts. A new assertion must fail for the missing behavior, not because of a test import error.
- [x] Step 3: Implement the tab interaction contract.
  Derive the current tab id with documentTabId, use openInTab for activation, and render real tab/close buttons with role=tab, aria-selected, and close labels. Add local menu state { id, x, y }; use the existing official menu pattern and wire fixed/unfixed, close current, close others, and close all actions. Navigate to the store-returned neighbor or / after closing the active tab.
- [x] Step 4: Add keyboard and drag cleanup.
  Make tab activation keyboard reachable, prevent the close button from activating the tab, clear drag state in onDragEnd, and reject drops between pinned and unpinned groups. Preserve the existing pinned-first ordering and team-scoped storage format.
- [x] Step 5: Run the focused tests and commit.
  From vendor/outline-web run: yarn vitest run app/utils/tabNavigation.test.ts app/stores/TabsStore.test.ts; then stage only the five tab files and commit with message feat: complete official web tab interactions.

### Task 2: Recompose the paper library with official Web primitives

**Files:**
- Modify: vendor/outline-web/app/scenes/Papers.tsx
- Create if needed: vendor/outline-web/app/scenes/PapersHelpers.ts
- Create if needed: vendor/outline-web/app/scenes/__tests__/PapersHelpers.test.ts

**Interfaces:**
- Consumes: existing paper snapshot/index loading, metadata hydration, DesktopBridge.webdavGet/webdavPut, views API, useStores, useCurrentUser, and openInTab.
- Produces: one Scene-based paper library with stable scope/filter/sort state, official controls, responsive paper rows, and unchanged interaction/storage callbacks.

- [x] Step 1: Write failing pure filter/sort tests.
  If extraction is needed, create a typed filterAndSortPapers(papers, metas, read, options) helper and test query/tag/read-state filtering plus newest-first updated sorting. Use current production paper/meta types; do not invent a second data model.
- [x] Step 2: Run the helper test and verify it fails.
  From vendor/outline-web run: yarn vitest run app/scenes/__tests__/PapersHelpers.test.ts. It must fail because the helper is missing or because the current inline composition does not satisfy the explicit contract.
- [x] Step 3: Extract only pure list composition.
  Move query/tag/read-state filtering and existing updated/views/likes/score/title/history sorting into the helper. Keep snapshot loading, metadata hydration, WebDAV writes, view creation, and openInTab in Papers.tsx.
- [x] Step 4: Replace duplicated page chrome.
  Keep one Scene with the paper icon, title, text title, and wide layout. Render one concise description/stat line and one official-style toolbar containing scope buttons, InputSearch, and select controls. Do not introduce large cards, gradients, or a second competing page heading.
- [x] Step 5: Rebuild paper rows for scan order.
  Use a lightweight hoverable list item. Put title and English title in the flexible column; keep source, venue, tags, read state, view count, likes, score, original link, and code link available. Use official icons and ButtonSmall/button semantics with labels or tooltips, stop propagation for row actions, and continue opening documents through openInTab. At narrow widths hide secondary text labels while retaining accessible icon controls.
- [x] Step 6: Implement non-blocking states.
  Use Empty or official tertiary/danger text for loading, no-result, and errors. When cached papers are visible while hydration continues, show a compact refresh hint. Never replace a populated list with a blank screen solely because metadata hydration failed.
- [x] Step 7: Test, lint, format, and commit.
  From vendor/outline-web run: yarn vitest run app/scenes/__tests__/PapersHelpers.test.ts; yarn lint:changed; yarn format:check; then stage only the paper files and commit with message feat: refresh official web paper library.

### Task 3: Recompose the discussion area with official Web primitives

**Files:**
- Modify: vendor/outline-web/app/scenes/Discuss.tsx
- Create if needed: vendor/outline-web/app/scenes/DiscussHelpers.ts
- Create if needed: vendor/outline-web/app/scenes/__tests__/DiscussHelpers.test.ts

**Interfaces:**
- Consumes: existing collection/document loading, client, useStores, openInTab, topic creation, likes, pins, and official document/comment navigation.
- Produces: a searchable, filterable discussion list with explicit pinned/regular grouping, official controls, accessible topic actions, and non-destructive error states.

- [x] Step 1: Write failing grouping/filter tests.
  Create a typed visibleTopics(topics, options, pinnedIds) helper if needed. Test combined category/query filtering and pinned-first ordering; use current Topic fields.
- [x] Step 2: Run the helper test and verify it fails.
  From vendor/outline-web run: yarn vitest run app/scenes/__tests__/DiscussHelpers.test.ts. It must fail because the helper is missing or because the current inline composition cannot satisfy the explicit grouping contract.
- [x] Step 3: Extract only pure visible-topic composition.
  Move category/query filtering and pinned-first sorting into the helper. Leave collection lookup, load state, create/pin API calls, and local likes in Discuss.tsx.
- [x] Step 4: Remove duplicate chrome and create the official toolbar.
  Keep one Scene with the comment icon, title, text title, and wide layout with official refresh and 发新帖 actions. Use InputSearch and official buttons. The composer must support category selection, Enter submit, Escape cancel, disabled submit while creating, and visible errors.
- [x] Step 5: Render pinned and regular topic groups.
  Give pinned topics a small group label or stable spacing separator, then render regular topics. Show title, author/time, category and activity metadata; use an accessible unread treatment rather than decorative emoji. Like and pin buttons must stop propagation, expose labels, and preserve current optimistic/API behavior. Open topics through openInTab.
- [x] Step 6: Cover missing, loading, empty, search-empty, and error states.
  Use Empty and official tertiary/danger styles. Distinguish a missing forum collection from a successful empty collection, and keep existing topics visible when a refresh fails.
- [x] Step 7: Test, lint, format, and commit.
  From vendor/outline-web run: yarn vitest run app/scenes/__tests__/DiscussHelpers.test.ts; yarn lint:changed; yarn format:check; then stage only the discussion files and commit with message feat: refresh official web discussion area.

### Task 4: Integrate, build, and document the UI refresh

**Files:**
- Modify: CHANGELOG.md
- Modify: root gitlink for vendor/outline-web after the submodule commits

**Interfaces:**
- Consumes: completed tab, paper, and discussion deliverables plus focused tests.
- Produces: a desktop bundle serving the updated official Web scenes through outline://app.

- [x] Step 1: Run the complete official Web app suite.
  From vendor/outline-web run: yarn test:app; yarn lint:changed; yarn format:check. Changed-file behavior must pass; isolate unrelated pre-existing failures by rerunning focused tests.
- [x] Step 2: Build the official Web bundle and desktop app.
  From the repository root run: npm run build. The official Web build must complete first, copy the bundle into apps/desktop/out/official-web, and finish Electron Vite.
- [ ] Step 3: Perform a targeted visual smoke check.
  Inspect light and dark themes at normal and narrow widths. Verify tab switching/closing/pinning, paper search/filter/open/link actions, discussion search/filter/post/pin/open actions, official document comments, and team isolation.
- [x] Step 4: Add the version-level changelog entry.
  Add a dated entry under the current development version in CHANGELOG.md describing the tab interaction refresh and Papers/Discuss visual integration. Include rationale (official components/tokens, no duplicate renderer) and caveats (existing server data/interaction contracts retained).
- [ ] Step 5: Verify the root diff and commit only the integration record.
  Run from the root: git status --short; git diff --check; git diff --submodule=log -- vendor/outline-web. Confirm unrelated pre-existing root changes remain untouched, then stage only CHANGELOG.md and the updated vendor/outline-web gitlink and commit with message docs: record official web extension ui refresh.

## Plan Verification

- Spec coverage: Tasks 1–3 cover tabs, Papers, Discuss, official components, responsive behavior, accessibility, preserved data paths, and unified openInTab; Task 4 covers tests, build, manual verification, and changelog requirements.
- Placeholder scan: no TBD, TODO, or undefined follow-up steps are required; helper files are created only when extraction makes the named tests smaller.
- Type consistency: helper signatures are constrained to current scene types; later tasks consume only the existing openInTab and TabsStore contracts.
