# Implementation Plan

## 1. Planning Principles

This plan assumes the architecture in [ARCHITECTURE.md](/Users/xqiao/Workspace/outline-desktop-client/docs/ARCHITECTURE.md) has been accepted, and that implementation starts with a documentation-approved scope rather than exploratory prototyping.

Execution principles:

- Ship a macOS-focused read path before deep write-path complexity
- Keep the main process security boundary clean from the first commit
- Use typed contracts for API and IPC before building feature surfaces
- Treat offline support as a cache design problem, not a late polish task
- Add Windows and Linux only after the macOS workflow is stable

## 2. Delivery Model

### Team Assumption

The plan assumes a small product team:

- 1 product-minded lead engineer
- 1 desktop/frontend engineer
- 1 part-time design or QA contributor

If staffing is smaller, phase durations stretch. If larger, some milestones can overlap, but the dependency order should remain mostly intact.

### Effort Scale

Estimates below are in **engineering weeks**, not calendar weeks.

Interpretation:

- `1 eng-week` = one engineer focused full time for one week
- A phase with `8-10 eng-weeks` can be done by two engineers in roughly half the calendar time if coordination overhead is managed well

## 3. Phase Overview

| Phase | Focus | Estimated effort | Primary outcome |
| --- | --- | --- | --- |
| Phase 1 | macOS MVP foundation and read path | 8-10 eng-weeks | signed-off shell, profiles, collections browser, document viewer |
| Phase 2 | editing, search, offline caching | 10-14 eng-weeks | usable daily-work desktop client |
| Phase 3 | tray, mini window, Windows/Linux, polish | 8-12 eng-weeks | cross-platform release candidate |

## 4. Cross-Phase Dependencies

These dependencies should be treated as architecture constraints, not optional sequencing preferences.

| Dependency | Needed by | Reason |
| --- | --- | --- |
| Stable IPC contracts | All phases | Prevent renderer/main drift |
| Profile and secret storage | All phases | Every API interaction depends on it |
| Shared API client | Phase 1+ | Avoid duplicated endpoint logic |
| SQLite schema and migrations | Phase 2+ | Cache, drafts, search, sync depend on it |
| Window manager foundation | Phase 3 | Tray and mini window depend on it |
| Error taxonomy | All phases | Required for usable UX and supportability |

## 5. Phase 1: macOS MVP

### Objective

Deliver a macOS-first client that supports:

- multiple server profiles
- collection browsing
- document listing
- document viewing

This phase intentionally stops short of full editing and offline mode. The goal is to make the read path and app shell correct before the more failure-prone sync path is introduced.

### Estimated Effort

`8-10 eng-weeks`

### In-Scope Deliverables

- Electron application shell running on macOS
- secure profile storage using macOS Keychain
- Outline API transport and typed method wrappers
- collection sidebar tree
- document list for selected collection
- document read view with markdown rendering and syntax highlighting
- basic app settings screen
- baseline logging and error surfaces

### Out Of Scope

- editing
- local drafts
- offline document bodies
- tray and mini window
- Windows/Linux packaging

### Milestones

#### Milestone 1.1: Foundation

Estimated effort: `1.5-2 eng-weeks`

Deliverables:

- repository structure created according to architecture
- build pipeline for Electron main, preload, and renderer
- shared type package
- renderer app shell with routing and providers
- strict Electron security defaults enabled

Definition of done:

- app launches reliably on macOS
- renderer has no direct Node access
- preload bridge is typed and minimal

Dependencies:

- architecture signoff

#### Milestone 1.2: Profile Management

Estimated effort: `1.5-2 eng-weeks`

Deliverables:

- create, list, update, delete profile flows
- base URL validation
- bearer token test-connection flow
- keychain-backed secret storage
- profile switcher in title bar

Definition of done:

- at least two profiles can coexist cleanly
- switching profiles updates queries and UI state without restart
- secrets never appear in renderer persistent state

Dependencies:

- milestone 1.1

#### Milestone 1.3: API Client And Collection Read Path

Estimated effort: `2-2.5 eng-weeks`

Deliverables:

- typed RPC client for:
  - `collections.list`
  - `collections.info`
  - `collections.documents`
  - `documents.list`
  - `documents.info`
- query cache integration
- loading and error states
- pagination handling for document lists

Definition of done:

- user can browse collections and open documents
- common auth and network failures have clear UX states
- list pagination works without duplicated items

Dependencies:

- milestone 1.2

#### Milestone 1.4: Document Viewer

Estimated effort: `2-2.5 eng-weeks`

Deliverables:

- markdown render pipeline
- code highlighting
- internal and external link handling
- document metadata header
- table of contents extraction for headings

Definition of done:

- common GFM constructs render correctly
- large documents remain responsive
- links are opened safely

Dependencies:

- milestone 1.3

#### Milestone 1.5: MVP Hardening

Estimated effort: `1 eng-week`

Deliverables:

- crash/error boundaries
- structured logs
- basic settings page
- app icon, naming, and baseline packaging notes

Definition of done:

- macOS MVP can be handed to internal testers

Dependencies:

- milestones 1.1 through 1.4

### Phase 1 Acceptance Criteria

- User can configure multiple Outline servers
- User can browse collections and view documents
- UI feels desktop-native on macOS
- App survives invalid tokens, rate limits, and offline startup gracefully
- No secret material leaks into renderer storage or logs

### Phase 1 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Outline document payload shape differs from assumptions | high | generate typed client from OpenAPI once coding begins |
| Markdown fidelity gaps in viewer | medium | build a compatibility matrix with sample docs early |
| Profile switching invalidates too much state | medium | isolate all query keys by `profileId` from day one |

## 6. Phase 2: Editing, Search, Offline Caching

### Objective

Turn the MVP from a reader into a usable daily client with:

- markdown editing
- full-text search
- selective offline access to recent documents

This is the highest complexity phase because it introduces mutable local state and sync failure handling.

### Estimated Effort

`10-14 eng-weeks`

### In-Scope Deliverables

- markdown editor based on CodeMirror 6
- document create/update/delete flows
- local draft persistence
- remote search
- local cached-doc search fallback
- SQLite-backed cache and sync queue
- recent-doc offline viewing

### Out Of Scope

- full real-time collaboration parity
- version history UI
- fully offline attachment binary workflow unless explicitly required

### Milestones

#### Milestone 2.1: Storage Layer

Estimated effort: `2-2.5 eng-weeks`

Deliverables:

- SQLite schema
- migrations framework
- repositories for collections, documents, drafts, sync queue
- cache policy configuration

Definition of done:

- local data can be inserted, updated, pruned, and migrated safely
- per-profile storage separation is enforced

Dependencies:

- Phase 1 complete

#### Milestone 2.2: Editor Integration

Estimated effort: `2.5-3 eng-weeks`

Deliverables:

- CodeMirror 6 markdown editor
- edit/read mode toggle
- save shortcut and save status UI
- dirty state tracking
- draft autosave checkpoints

Definition of done:

- user can edit an existing document without losing content
- unsaved drafts survive app restart
- editor remains responsive on large markdown files

Dependencies:

- milestone 2.1

#### Milestone 2.3: Document Mutation Flows

Estimated effort: `1.5-2 eng-weeks`

Deliverables:

- `documents.create`
- `documents.update`
- `documents.delete`
- optimistic state refresh and query invalidation
- conflict/error handling UX

Definition of done:

- save failures preserve local drafts
- list and document views remain consistent after mutation
- user sees whether content is local draft, synced, or conflicted

Dependencies:

- milestone 2.2

#### Milestone 2.4: Search

Estimated effort: `2-2.5 eng-weeks`

Deliverables:

- global search screen
- remote Outline search integration
- recent query persistence
- local fallback search over cached documents
- search ranking heuristics for local mode

Definition of done:

- online search feels fast and keyboard-driven
- offline search clearly labels itself as partial/local
- search results open directly into documents

Dependencies:

- milestones 2.1 and 2.2

#### Milestone 2.5: Offline Cache And Sync

Estimated effort: `2-3 eng-weeks`

Deliverables:

- recent document cache
- pin-for-offline behavior
- stale/fresh metadata model
- background revalidation scheduler
- sync queue inspection UI

Definition of done:

- recently opened documents are available offline
- cache prunes by quota rather than unbounded growth
- reconnect behavior is understandable and stable

Dependencies:

- milestones 2.1 through 2.4

### Phase 2 Acceptance Criteria

- User can create and edit markdown documents
- App preserves drafts across restarts and transient API failures
- Search works online and degrades honestly offline
- Recent documents are accessible without network
- Sync/conflict states are visible and actionable

### Phase 2 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Outline rich content does not round-trip cleanly through markdown editor | high | define supported subset and fallback behavior before implementation |
| Draft/sync bugs cause data loss | high | checkpoint drafts aggressively and test failure modes first |
| Search scope or endpoint behavior differs by Outline deployment | medium | keep remote search adapter isolated behind typed methods |

## 7. Phase 3: Tray, Mini Window, Windows/Linux, Polish

### Objective

Make the product feel like a real desktop client rather than a packaged web app.

This phase introduces:

- system tray
- mini window
- platform expansion
- UX and release polish

### Estimated Effort

`8-12 eng-weeks`

### In-Scope Deliverables

- tray icon and menu
- mini window for quick search and recents
- global shortcut
- Windows packaging and native secret storage
- Linux packaging and native secret storage
- updater and signing strategy
- accessibility and performance polish

### Milestones

#### Milestone 3.1: Window And Tray Framework

Estimated effort: `1.5-2 eng-weeks`

Deliverables:

- tray controller
- mini window lifecycle
- focus and restore behavior
- deep-link or command routing from mini window to main window

Definition of done:

- tray icon behaves correctly on macOS
- mini window opens instantly and reliably focuses input

Dependencies:

- Phase 2 complete

#### Milestone 3.2: Mini Window Product Surface

Estimated effort: `1.5-2 eng-weeks`

Deliverables:

- quick search input
- recent documents list
- favorites or pinned offline docs list
- profile quick switch

Definition of done:

- user can reach a recent or searched document without navigating the full app

Dependencies:

- milestone 3.1

#### Milestone 3.3: Windows Support

Estimated effort: `2-3 eng-weeks`

Deliverables:

- Windows build pipeline
- Credential Manager secret storage adapter
- window chrome and shortcut adjustments
- packaging smoke tests

Definition of done:

- Windows build is installable and core features match macOS MVP plus Phase 2 features

Dependencies:

- milestones 3.1 and 3.2

#### Milestone 3.4: Linux Support

Estimated effort: `2-3 eng-weeks`

Deliverables:

- Linux build pipeline
- Secret Service/libsecret adapter
- distro-specific packaging decision
- tray behavior validation on major desktop environments

Definition of done:

- Linux build runs on at least one primary supported environment
- unsupported tray edge cases are documented rather than silently ignored

Dependencies:

- milestone 3.3 is helpful but not mandatory

#### Milestone 3.5: Release Polish

Estimated effort: `1-2 eng-weeks`

Deliverables:

- updater strategy
- code signing/notarization plan
- startup performance pass
- accessibility pass
- QA checklist and release notes template

Definition of done:

- app is credible as a release candidate rather than an internal tool

Dependencies:

- milestones 3.1 through 3.4

### Phase 3 Acceptance Criteria

- Tray and mini window are genuinely useful, not novelty surfaces
- Windows and Linux users can complete the main browse/edit/search flows
- Packaging and update story is documented and testable
- Performance and accessibility regressions are addressed before release

### Phase 3 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Tray behavior varies across Linux environments | medium | document supported environments and degrade gracefully |
| Cross-platform keyboard shortcut conflicts | medium | keep shortcuts configurable and OS-aware |
| Platform-specific packaging complexity slows release | medium | start signing/notarization investigation before the end of Phase 2 |

## 8. Recommended Work Breakdown By Discipline

### Desktop/Core

- app bootstrap
- IPC
- storage
- window management
- keychain adapters
- sync scheduler

### Frontend/UI

- shell layout
- collection browser
- document screen
- editor surface
- search surface
- settings and cache UX

### QA/Validation

- API compatibility checks against Outline instances
- offline mode scenarios
- conflict-save scenarios
- profile switching regressions
- platform packaging smoke tests

## 9. Testing Strategy By Phase

### Phase 1

- unit tests for API client normalization
- renderer tests for profile and collection flows
- smoke integration tests for app boot and profile switch

### Phase 2

- storage migration tests
- draft persistence tests
- save conflict tests
- offline cache read-path tests
- search mode switching tests

### Phase 3

- tray and mini-window integration tests
- cross-platform packaging smoke tests
- keyboard shortcut tests
- accessibility audits

## 10. Release Readiness Gates

The team should not advance phases based only on “the feature exists.” Use these gates:

### Gate A: End Of Phase 1

- core browse flow stable
- profile security model validated
- no known crashers in standard navigation

### Gate B: End Of Phase 2

- no unresolved data-loss bugs
- offline behavior documented and accurate
- search and edit states understandable to users

### Gate C: End Of Phase 3

- platform packaging complete
- updater/signing plan complete
- mini window validated as useful in user testing

## 11. Recommended Sequencing Inside Each Sprint

Within each implementation cycle, keep this order:

1. contract and schema
2. main-process implementation
3. preload bridge
4. renderer integration
5. tests and failure-path validation

This order prevents the common desktop-app failure mode where the UI outruns the trusted core and later forces unsafe shortcuts.

## 12. Potential Future Phase 4

Not part of the requested plan, but useful to keep visible:

- detached document windows
- richer attachment workflows
- version history and compare
- push notifications
- command palette with document actions
- deeper parity with Outline-specific rich blocks

Do not let these items leak backward into Phases 1-3 unless product requirements change.

## 13. Final Recommendation

Treat Phase 1 as a shell-and-read-path hardening effort, Phase 2 as the real product phase, and Phase 3 as the desktop-native and cross-platform completion phase.

The main trap to avoid is pulling editing and offline sync too early into the MVP. The faster path is:

1. secure shell
2. stable read path
3. disciplined local state
4. platform polish

That sequencing yields a product that can be trusted before it tries to be ambitious.

## 14. Sources

- Outline repo: <https://github.com/outline/outline>
- Outline API guide: <https://docs.getoutline.com/s/guide/doc/api-1rEIXDfLF6>
- Outline OpenAPI repo: <https://github.com/outline/openapi>
- Electron release schedule: <https://releases.electronjs.org/schedule>
- Electron security docs: <https://www.electronjs.org/docs/tutorial/security/>
- Tauri capabilities docs: <https://v2.tauri.app/security/capabilities/>
- Tauri webview versions: <https://v2.tauri.app/reference/webview-versions/>
