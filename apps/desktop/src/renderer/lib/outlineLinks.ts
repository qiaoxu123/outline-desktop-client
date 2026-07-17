import { SERVER_URL } from "../hooks/useOutline";
import { unwrapIpc } from "./ipc";
import type { ElectronAPI } from "../../preload/index";

/** An internal Outline target parsed out of a link href. */
interface InternalTarget {
  kind: "doc" | "share";
  /** doc: urlId (short id); share: shareId. */
  key: string;
}

/**
 * Parse a link href. Returns an internal Outline doc/share target when the link
 * points at this server's /doc/ or /s/ path (absolute or relative); null for
 * anything external (OneDrive, arXiv, …).
 */
export function parseInternalLink(href: string): InternalTarget | null {
  if (!href) return null;
  let url: URL;
  try {
    // relative hrefs resolve against the server origin
    url = new URL(href, SERVER_URL);
  } catch {
    return null;
  }
  if (url.origin !== new URL(SERVER_URL).origin) return null;

  const doc = /^\/doc\/([^/?#]+)/.exec(url.pathname);
  if (doc) {
    const seg = decodeURIComponent(doc[1]);
    // Outline doc URLs are /doc/<slug>-<urlId>; the urlId is the last segment.
    const urlId = seg.split("-").pop() || seg;
    return { kind: "doc", key: urlId };
  }
  const share = /^\/s\/([^/?#]+)/.exec(url.pathname);
  if (share) return { kind: "share", key: decodeURIComponent(share[1]) };
  return null;
}

/**
 * Open a link the way the app should: internal doc/share links resolve to the
 * document and open as an in-app tab (navigate to /document/:id); everything
 * else opens in the system browser (window.open → main setWindowOpenHandler →
 * shell.openExternal). Mirrors the web app, where internal links open in a new
 * tab and external ones open a new browser tab.
 */
export async function openOutlineLink(
  href: string,
  ctx: {
    navigate: (to: string) => void;
    api: ElectronAPI;
    profileId: string | null;
  },
): Promise<void> {
  const target = parseInternalLink(href);
  if (target && ctx.profileId) {
    try {
      const params =
        target.kind === "share"
          ? { shareId: target.key }
          : { id: target.key };
      const info = await unwrapIpc<{ data?: { id?: string } }>(
        ctx.api.call(ctx.profileId, "documents.info", params),
      );
      const id = info?.data?.id;
      if (id) {
        ctx.navigate(`/document/${id}`);
        return;
      }
    } catch {
      // resolution failed — fall through and open externally
    }
  }
  window.open(href, "_blank");
}
