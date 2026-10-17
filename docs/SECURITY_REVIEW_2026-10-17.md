# Desktop security and reliability review — 2026-10-17

Baseline: `codex/outline-workspace-polish` (v1.20.0-rc.3). This is the active official-web Electron product; the legacy local React renderer is not the packaged UI.

## Fixed in this branch

1. Remove embedded Jianguoyun WebDAV account password. Supply `OUTLINE_WEBDAV_USER` and `OUTLINE_WEBDAV_PASSWORD` via the application environment until an OS-keychain-backed settings UI is implemented. WebDAV returns `NOT_CONFIGURED` rather than using a baked-in credential.
2. Reject malformed WebDAV relative paths.
3. Match Outline server requests by parsed URL **origin**, never by string prefix, before injecting Bearer authorization or allowing attachment download.
4. Restrict external URL opening to HTTP(S) and mailto; unrecognized protocols are not passed to the OS.
5. Do not automatically accept invalid certificates. Private-CA servers must install a trusted CA certificate.
6. Keep TLS verification enabled even when the optional HTTP proxy is enabled.
7. Disable automatic retries for Outline mutation RPCs; network failures after writes have ambiguous commit status and must not be replayed automatically.
8. Use `AbortSignal.any` to avoid accumulating abort listeners.

## Critical follow-up

- **Immediately revoke and rotate the old WebDAV application password.** It was committed to a public repository and remains discoverable in Git history, even after source removal.
- Build an OS-keychain-backed settings UI for the new per-installation credentials. Environment variables are a safe interim measure but not good end-user UX.
- Migrate plaintext Outline profile tokens (`profiles.json`) and AI credentials (`ai-config.json`) to `safeStorage` or OS keychain with safe migration and permission handling.
- Review auth/login callback URL logging and avoid logging token-bearing query strings.
- Restrict the Electron protocol and IPC trust boundary with request-sender validation and a CSP.
- Implement ETag/conditional WebDAV writes or a server-backed transactional endpoint for multi-device concurrency.

## Validation

Source-level review performed through the GitHub connector. Local installation, Electron runtime integration, and npm build/test were **not** executed (the working environment cannot clone GitHub over the network). CI should run against this PR before merge, followed by macOS/Windows/Linux smoke testing. Changes intentionally do not merge into the product baseline automatically.
