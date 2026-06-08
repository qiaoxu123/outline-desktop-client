import { useUIStore } from "../../state/uiStore";
import "./TitleBar.css";

export default function TitleBar(): React.ReactElement {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
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
          title="Toggle sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3h12v1.5H2V3zm0 4h12v1.5H2V7zm0 4h8v1.5H2V11z" />
          </svg>
        </button>
        <span className="titlebar-app-name">Outline</span>
      </div>
      <div className="titlebar-right">
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
