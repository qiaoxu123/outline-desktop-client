import { useEffect, useRef, useState } from "react";
import "./ForumPane.css";

const FORUM_URL = "https://forum.jlu-mcns.site/";

/** Electron <webview> methods we use (only callable once attached). */
interface WebviewEl extends HTMLElement {
  src: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  getURL(): string;
}

/**
 * In-app forum panel. Mounted permanently in AppShell and toggled with CSS so
 * switching away keeps the login session, scroll position and history —
 * the webview is created lazily on first visit.
 */
export default function ForumPane({
  visible,
}: {
  visible: boolean;
}): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<WebviewEl | null>(null);
  const [everShown, setEverShown] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && !everShown) setEverShown(true);
  }, [visible, everShown]);

  // <webview> has no React typings — create it imperatively.
  useEffect(() => {
    if (!everShown || webviewRef.current || !containerRef.current) return;
    const wv = document.createElement("webview") as WebviewEl;
    wv.setAttribute("src", FORUM_URL);
    wv.className = "forum-webview";
    containerRef.current.appendChild(wv);
    webviewRef.current = wv;

    const update = () => {
      try {
        setCanBack(wv.canGoBack());
        setCanForward(wv.canGoForward());
      } catch {
        // methods throw before the webview is attached — ignore
      }
    };
    wv.addEventListener("did-navigate", update);
    wv.addEventListener("did-navigate-in-page", update);
    wv.addEventListener("did-start-loading", () => setLoading(true));
    wv.addEventListener("did-stop-loading", () => {
      setLoading(false);
      update();
    });
  }, [everShown]);

  if (!everShown) return null;

  const wv = () => webviewRef.current;

  return (
    <div className={`forum-pane ${visible ? "" : "hidden"}`}>
      <div className="forum-toolbar">
        <button
          className="titlebar-button"
          disabled={!canBack}
          onClick={() => wv()?.goBack()}
          title="后退"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3.5L5.5 8l4.5 4.5 1.06-1.06L7.62 8l3.44-3.44L10 3.5z" />
          </svg>
        </button>
        <button
          className="titlebar-button"
          disabled={!canForward}
          onClick={() => wv()?.goForward()}
          title="前进"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3.5L10.5 8 6 12.5l-1.06-1.06L8.38 8 4.94 4.56 6 3.5z" />
          </svg>
        </button>
        <button
          className="titlebar-button"
          onClick={() => wv()?.reload()}
          title="刷新"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 104.9 6h-1.53A3.5 3.5 0 118 4.5c.97 0 1.85.4 2.48 1.02L8.5 7.5H13V3l-1.46 1.46A4.98 4.98 0 008 3z" />
          </svg>
        </button>
        <span className="forum-title">
          社区论坛{loading ? " · 加载中…" : ""}
        </span>
        <button
          className="titlebar-button forum-open-external"
          onClick={() => {
            let url = FORUM_URL;
            try {
              url = wv()?.getURL() || FORUM_URL;
            } catch {
              // not attached yet
            }
            window.open(url);
          }}
          title="在浏览器中打开"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10h-1.5v2.5h-8v-8H6V3zm3 0v1.5h2.44L6.5 9.44l1.06 1.06 4.94-4.94V8H14V3H9z" />
          </svg>
        </button>
      </div>
      <div ref={containerRef} className="forum-body" />
    </div>
  );
}
