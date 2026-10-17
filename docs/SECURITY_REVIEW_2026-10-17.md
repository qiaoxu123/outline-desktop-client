# Desktop security and reliability review — 2026-10-17

Baseline: `codex/outline-workspace-polish` (v1.20.0-rc.3). This is the active official-web Electron product; the legacy local React renderer is not the packaged UI.

## Fixed in this branch

1. Remove embedded Jianguoyun WebDAV account password. New credentials can be entered in the **official Outline Web → Preferences → 桌面端同步**. They are encrypted using Electron `safeStorage` and stored locally, not transmitted to renderer code. `OUTLINE_WEBDAV_USER` / `OUTLINE_WEBDAV_PASSWORD` remain a fallback for managed installations. The Linux `basic_text` backend is intentionally rejected.
2. Reject malformed WebDAV relative paths.
3. Match Outline server requests by parsed URL **origin**, never by string prefix, before injecting Bearer authorization or allowing attachment download.
4. Restrict external URL opening to HTTP(S) and mailto; unrecognized protocols are not passed to the OS.
5. Do not automatically accept invalid certificates. Private-CA servers must install a trusted CA certificate.
6. Keep TLS verification enabled even when the optional HTTP proxy is enabled.
7. Disable automatic retries for Outline mutation RPCs; network failures after writes have ambiguous commit status and must not be replayed automatically.
8. Use `AbortSignal.any` to avoid accumulating abort listeners.

## Critical follow-up

- **Immediately revoke and rotate the old WebDAV application password.** It was committed to a public repository and remains discoverable in Git history, even after source removal.
- **Set up a newly rotated WebDAV application password in desktop Preferences** after installing the updated app. Before that, WebDAV-dependent features report `NOT_CONFIGURED` and will not sync. Desktop settings UI is implemented; a manual macOS/Windows/Linux smoke test remains required.
- Migrate plaintext Outline profile tokens (`profiles.json`) and AI credentials (`ai-config.json`) to `safeStorage` or OS keychain with safe migration and permission handling.
- The login callback URL and redirect query parameters are no longer logged. Review log sanitization in any additional sign-in providers before publishing.
- Restrict the Electron protocol and IPC trust boundary with request-sender validation and a CSP.
- Implement ETag/conditional WebDAV writes or a server-backed transactional endpoint for multi-device concurrency.

## Validation

Source-level review performed through the GitHub connector. Local installation, Electron runtime integration, and npm build/test were **not** executed (the working environment cannot clone GitHub over the network). CI should run against this PR before merge, followed by macOS/Windows/Linux smoke testing. Changes intentionally do not merge into the product baseline automatically.

## Subsequent improvements

- Use only the current active profile for attachment authorization; request headers are injected only for the exact first-party `/api/attachments.redirect` endpoint.
- WebDAV directory creation is memoized per running process, reducing unnecessary MKCOL requests; a failed PUT with HTTP 409 invalidates the cache and retries after recreating parents.
- Tests: `src/main/__tests__/webdavCredentials.test.ts` and `src/main/__tests__/securityUrls.test.ts` validate credentials, backend fallback, URL origin and attachment token rules.
- WebDAV data itself still uses the existing JSON files. Synchronization semantics are unchanged; multi-device concurrent writers still require future conditional updates (ETag / server-side transactions).
