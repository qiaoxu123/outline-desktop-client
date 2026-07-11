/** Outline server base URL (single-server app; also hardcoded in LoginScreen). */
export const SERVER_URL = "https://notes.jlu-mcns.site";

/**
 * Attachments are stored in markdown as relative paths
 * (`/api/attachments.redirect?id=…`) — prefix the server origin for display.
 * Auth is injected by the main process (webRequest.onBeforeSendHeaders).
 */
export function absoluteAttachmentUrl(src: string): string {
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  return SERVER_URL + (src.startsWith("/") ? src : `/${src}`);
}
