import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import TabBar from "./TabBar";
import "./TitleBar.css";

export default function TitleBar(): React.ReactElement {
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const fullWidth = useUIStore((s) => s.fullWidth);
  const toggleFullWidth = useUIStore((s) => s.toggleFullWidth);
  const showToc = useUIStore((s) => s.showToc);
  const toggleToc = useUIStore((s) => s.toggleToc);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  // Effective dark state (resolving "system" against the OS preference) so the
  // one-click toggle flips to the opposite of what's actually on screen.
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  // Reserve space for macOS traffic lights; Windows/Linux use a native frame.
  const isMac = window.electronAPI.platform === "darwin";

  return (
    <header
      className="titlebar"
      style={isMac ? { paddingLeft: "80px" } : undefined}
    >
      <div className="titlebar-left">
        <button
          className="titlebar-button"
          onClick={toggleSidebar}
          title="切换侧边栏"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3h12v1.5H2V3zm0 4h12v1.5H2V7zm0 4h8v1.5H2V11z" />
          </svg>
        </button>
        <button
          className="titlebar-button"
          onClick={() => navigate(-1)}
          title="后退"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3.5L5.5 8l4.5 4.5 1.06-1.06L7.62 8l3.44-3.44L10 3.5z" />
          </svg>
        </button>
        <button
          className="titlebar-button"
          onClick={() => navigate(1)}
          title="前进"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3.5L10.5 8 6 12.5l-1.06-1.06L8.38 8 4.94 4.56 6 3.5z" />
          </svg>
        </button>
      </div>
      <div className="titlebar-center">
        <TabBar />
      </div>
      <div className="titlebar-right">
        <button
          className={`titlebar-button ${showToc ? "active" : ""}`}
          onClick={toggleToc}
          title={showToc ? "隐藏目录" : "显示目录"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 3h9v1.5H5V3zm0 4h9v1.5H5V7zm0 4h9v1.5H5V11zM2 3.75a.75.75 0 111.5 0 .75.75 0 01-1.5 0zm0 4a.75.75 0 111.5 0 .75.75 0 01-1.5 0zm0 4a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
          </svg>
        </button>
        <button
          className={`titlebar-button ${fullWidth ? "active" : ""}`}
          onClick={toggleFullWidth}
          title={fullWidth ? "标准宽度" : "全宽显示"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 8l3.5-3v2h7V5L15 8l-3.5 3V9h-7v2L1 8z" />
          </svg>
        </button>
        <button
          className="titlebar-button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "切换到浅色" : "切换到深色"}
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM8 0a.75.75 0 01.75.75v1a.75.75 0 01-1.5 0v-1A.75.75 0 018 0zm0 12.5a.75.75 0 01.75.75v1a.75.75 0 01-1.5 0v-1A.75.75 0 018 12.5zM16 8a.75.75 0 01-.75.75h-1a.75.75 0 010-1.5h1A.75.75 0 0116 8zM3.5 8a.75.75 0 01-.75.75h-1a.75.75 0 010-1.5h1A.75.75 0 013.5 8zm9.96-4.46a.75.75 0 010 1.06l-.7.7a.75.75 0 11-1.06-1.06l.7-.7a.75.75 0 011.06 0zM4.3 11.7a.75.75 0 010 1.06l-.7.7a.75.75 0 01-1.06-1.06l.7-.7a.75.75 0 011.06 0zm8.16 1.76a.75.75 0 01-1.06 0l-.7-.7a.75.75 0 011.06-1.06l.7.7a.75.75 0 010 1.06zM4.3 4.3a.75.75 0 01-1.06 0l-.7-.7A.75.75 0 013.6 2.54l.7.7a.75.75 0 010 1.06z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.2 1.4a6.5 6.5 0 108.4 8.4A5.5 5.5 0 016.2 1.4z" />
            </svg>
          )}
        </button>
        <a href="#/search" className="titlebar-button" title="Search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.975 1.975 0 00-.017.016zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
        </a>
        <a href="#/settings" className="titlebar-button" title="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4zM14.3 8.7l-1.18-.68a5.09 5.09 0 000-1.04l1.18-.68a.3.3 0 00.11-.41l-1-1.73a.3.3 0 00-.41-.11l-1.18.68a5.09 5.09 0 00-.9-.52l-.18-1.37a.3.3 0 00-.3-.24H8.56a.3.3 0 00-.3.24l-.18 1.37c-.32.14-.62.32-.9.52l-1.18-.68a.3.3 0 00-.41.11l-1 1.73a.3.3 0 00.11.41l1.18.68a5.09 5.09 0 000 1.04l-1.18.68a.3.3 0 00-.11.41l1 1.73a.3.3 0 00.41.11l1.18-.68c.28.2.58.38.9.52l.18 1.37a.3.3 0 00.3.24h1.88a.3.3 0 00.3-.24l.18-1.37c.32-.14.62-.32.9-.52l1.18.68a.3.3 0 00.41-.11l1-1.73a.3.3 0 00-.11-.41z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
