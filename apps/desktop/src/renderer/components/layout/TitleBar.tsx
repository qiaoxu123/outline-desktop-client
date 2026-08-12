import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
import TabBar from "./TabBar";
import "./TitleBar.css";

export default function TitleBar(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const showToc = useUIStore((s) => s.showToc);
  const toggleToc = useUIStore((s) => s.toggleToc);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const aiPanelOpen = useUIStore((s) => s.aiPanelOpen);
  const setAiPanelOpen = useUIStore((s) => s.setAiPanelOpen);
  const [refreshing, setRefreshing] = useState(false);

  // Reload server data (collections, document trees, papers, comments…) —
  // invalidates every cache under the active profile so moves/edits made
  // elsewhere show up without restarting the app.
  const refresh = () => {
    setRefreshing(true);
    void queryClient.invalidateQueries({ queryKey: ["profile", activeProfileId] });
    window.setTimeout(() => setRefreshing(false), 700);
  };
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
          <OIcon name="sidebar" size={18} />
        </button>
        <button
          className="titlebar-button"
          onClick={() => navigate(-1)}
          title="后退"
        >
          <OIcon name="back" size={18} />
        </button>
        <button
          className="titlebar-button"
          onClick={() => navigate(1)}
          title="前进"
        >
          <OIcon name="back" size={18} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>
      <div className="titlebar-center">
        <TabBar />
      </div>
      <div className="titlebar-right">
        <button
          className="titlebar-button"
          onClick={refresh}
          title="刷新(重新拉取服务器数据)"
        >
          <OIcon
            name="refresh"
            size={18}
            style={
              refreshing
                ? { animation: "tb-spin 0.7s linear" }
                : undefined
            }
          />
        </button>
        <button
          className={`titlebar-button ${showToc ? "active" : ""}`}
          onClick={toggleToc}
          title={showToc ? "隐藏目录" : "显示目录"}
        >
          <OIcon name="toc" size={18} />
        </button>
        <button
          className="titlebar-button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "切换到浅色" : "切换到深色"}
        >
          <OIcon name={isDark ? "sun" : "moon"} size={18} />
        </button>
        <button
          className={`titlebar-button ${aiPanelOpen ? "active" : ""}`}
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          title="AI 助手"
        >
          <OIcon name="sparkle" size={18} />
        </button>
        <a href="#/search" className="titlebar-button" title="Search">
          <OIcon name="search" size={18} />
        </a>
        <a href="#/settings" className="titlebar-button" title="Settings">
          <OIcon name="settings" size={18} />
        </a>
      </div>
    </header>
  );
}
