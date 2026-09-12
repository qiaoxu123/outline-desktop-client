/**
 * Outline server base URL. Defaults to the JLUMCNS-MEC instance but is
 * overridden by the active profile's serverUrl once the app loads (App.tsx
 * calls setServerUrl). Modules that are not React components (TipTap image
 * extension, markdown renderer) read it via getServerUrl().
 */
export const DEFAULT_SERVER_URL = "https://notes.jlu-mcns.site";

let currentServerUrl = DEFAULT_SERVER_URL;

export function getServerUrl(): string {
  return currentServerUrl;
}

export function setServerUrl(url: string): void {
  currentServerUrl = url.replace(/\/+$/, "");
}

/**
 * Attachments are stored in markdown as relative paths
 * (`/api/attachments.redirect?id=…`) — prefix the server origin for display.
 * Auth is injected by the main process (webRequest.onBeforeSendHeaders).
 */
export function absoluteAttachmentUrl(src: string): string {
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  return getServerUrl() + (src.startsWith("/") ? src : `/${src}`);
}
