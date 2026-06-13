# Outline Desktop Client

Cross-platform desktop client architecture for [Outline](https://github.com/outline/outline), designed for a macOS-first release and later expansion to Windows and Linux.

The application is implemented (current version `1.7.0`): an Electron + React 19 desktop client with multi-profile support, a collection browser, a markdown viewer/editor, and full-text search.

## Installation (macOS)

The macOS builds are **ad-hoc signed**, not signed with a paid Apple Developer ID. This is enough for the app to launch on Apple Silicon (arm64) without the *"App is damaged and can't be opened"* error, but because downloaded files carry a quarantine attribute, the **first launch still shows *"cannot verify the developer"***.

Two ways to open it the first time:

1. **Right-click → Open** (recommended): in Finder, right-click (or Control-click) `Outline Desktop.app`, choose **Open**, then confirm **Open** in the dialog. macOS remembers this choice for subsequent launches.

2. **Remove the quarantine attribute from Terminal** — useful when the right-click flow is blocked or you are scripting the install:

   ```bash
   # After dragging the app to /Applications:
   xattr -cr "/Applications/Outline Desktop.app"

   # Or remove only the quarantine flag:
   xattr -dr com.apple.quarantine "/Applications/Outline Desktop.app"
   ```

   After this the app opens normally with a double-click.

> Why ad-hoc signing: arm64 binaries must carry at least an ad-hoc code signature to execute at all. The build runs `codesign --sign -` on the packed `.app` (see `apps/desktop/build/after-pack.js`) and disables electron-builder's Gatekeeper assessment so the unsigned-by-Developer-ID build can still be packaged.

## Goals

- Provide a native-feeling desktop experience for Outline workspaces
- Support multiple Outline servers and user profiles
- Make collections and documents faster to access than the browser flow
- Deliver reliable offline access to recently used documents
- Add desktop-specific affordances such as tray access and a mini window

## Product Scope

The client targets these core capabilities:

1. Multiple server profiles
2. Collection browser with sidebar tree and document list
3. Document viewer and editor with full GFM markdown support
4. Full-text search across server content
5. Offline caching for recent documents
6. System tray and mini window for quick access

## Recommended Technical Direction

The architecture documents recommend **Electron** as the initial shell, with:

- `Electron 42.x` as the desktop runtime baseline
- `React 19` + `TypeScript 5.x` for UI
- `TanStack Query 5` for server state
- `Zustand 5` for renderer UI/app state
- `CodeMirror 6` for markdown editing
- `markdown-it` + `highlight.js` for read-mode rendering
- `better-sqlite3` in the desktop main process for offline storage

The recommendation is intentional rather than neutral:

- macOS is the first target, and Electron gives the most predictable browser feature surface for a markdown-heavy editor
- Search, caching, attachments, tray, updater, and window orchestration are all mature in Electron
- Tauri 2 is attractive for bundle size and security posture, but adds Rust operational complexity and greater runtime variance across macOS, Windows, and Linux webviews

See [docs/ARCHITECTURE.md](/Users/xqiao/Workspace/outline-desktop-client/docs/ARCHITECTURE.md) for the full tradeoff analysis.

## Document Set

- [README.md](/Users/xqiao/Workspace/outline-desktop-client/README.md): overview, setup, quick start
- [docs/ARCHITECTURE.md](/Users/xqiao/Workspace/outline-desktop-client/docs/ARCHITECTURE.md): full system design
- [docs/IMPLEMENTATION_PLAN.md](/Users/xqiao/Workspace/outline-desktop-client/docs/IMPLEMENTATION_PLAN.md): phased execution plan

## Outline API Grounding

The design is grounded in Outline’s public API documentation and OpenAPI repository:

- Outline API guide states the API is RPC-style, uses `POST /api/:method`, and supports `Authorization: Bearer <API_KEY>` authentication.
- The OpenAPI repository documents hosted and self-hosted server patterns and the `BearerAuth` scheme.
- The prompt-provided methods such as `documents.list`, `documents.info`, `collections.list`, and `attachments.create` are aligned with that model.

One ambiguity is worth calling out: the public OpenAPI snapshot and guide clearly establish the RPC convention, auth model, pagination, and scope behavior, but endpoint discoverability in the rendered GitHub view is less convenient than the developer portal. The implementation should therefore generate method types from the live OpenAPI spec during build time once coding begins.

## Quick Start For A Future Implementation

This section describes how a future implementation should be approached after the design review is accepted.

1. Read [docs/ARCHITECTURE.md](/Users/xqiao/Workspace/outline-desktop-client/docs/ARCHITECTURE.md) first.
2. Follow [docs/IMPLEMENTATION_PLAN.md](/Users/xqiao/Workspace/outline-desktop-client/docs/IMPLEMENTATION_PLAN.md) phase by phase.
3. Start with the macOS MVP:
   - shell app
   - secure profile storage
   - collections browser
   - document viewer
4. Add editing, search, and offline cache only after the read-path is stable.
5. Add tray, mini-window, packaging, and Windows/Linux support last.

## Proposed Repository Layout

When implementation starts, use this top-level structure:

```text
outline-desktop-client/
  README.md
  docs/
    ARCHITECTURE.md
    IMPLEMENTATION_PLAN.md
  apps/
    desktop/
  packages/
    api-client/
    shared-types/
    ui/
  tooling/
```

The detailed module layout and responsibilities are defined in the architecture document.

## Feature Summary

### Multiple server profiles

- Separate profile records per Outline workspace
- API key stored in OS keychain, not plaintext config
- Fast workspace switching with isolated local caches

### Collection browser

- Left sidebar tree for collections and pinned sections
- Center list for collection documents and metadata
- Incremental loading and cached list hydration

### Document viewer/editor

- Split read and edit modes
- GFM tables, task lists, fenced code blocks, links, callouts
- Keyboard-first desktop workflows

### Search

- Server-backed search as source of truth
- Recent-query cache and local fallback over cached docs
- Search results grouped by collection and recency

### Offline mode

- Read access to recent documents and collections metadata
- Attachment metadata cached; binary file caching optional by policy
- Background sync when connectivity returns

### Tray and mini window

- Quick search, recent docs, and profile switcher
- Global shortcut to summon a compact command surface
- Desktop-native entry point without opening the full app

## Setup Status

Current status: documentation only.

No commands need to be run yet. This repository intentionally avoids:

- `npm init`
- package installation
- Electron or Tauri scaffolding
- generated source files

## Review Checklist

Use this checklist before implementation begins:

- Architecture recommendation approved
- Editor and markdown rendering decisions approved
- Offline storage model approved
- Security and key-storage approach approved
- macOS MVP scope frozen
- Windows/Linux parity criteria agreed

## Sources

- Outline repository: <https://github.com/outline/outline>
- Outline API guide: <https://docs.getoutline.com/s/guide/doc/api-1rEIXDfLF6>
- Outline OpenAPI repo: <https://github.com/outline/openapi>
- Electron release schedule: <https://releases.electronjs.org/schedule>
- Electron security docs: <https://www.electronjs.org/docs/tutorial/security/>
- Tauri capabilities: <https://v2.tauri.app/security/capabilities/>
- Tauri webview versions: <https://v2.tauri.app/reference/webview-versions/>
- CodeMirror changelog: <https://codemirror.net/docs/changelog/>
- Tiptap docs: <https://tiptap.dev/docs/editor/getting-started/overview>
- Monaco editor docs: <https://microsoft.github.io/monaco-editor/>
