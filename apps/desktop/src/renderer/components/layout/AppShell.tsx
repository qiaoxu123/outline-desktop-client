import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import TitleBar from "./TitleBar";
import Breadcrumb from "./Breadcrumb";
import { useUIStore } from "../../state/uiStore";
import "./AppShell.css";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;

function loadSidebarWidth(): number {
  const v = Number(localStorage.getItem("ui.sidebarWidth"));
  return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : 260;
}

export default function AppShell(): React.ReactElement {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const fullWidth = useUIStore((s) => s.fullWidth);
  const contentWidth = useUIStore((s) => s.contentWidth);
  const contentRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);

  // Drag the sidebar's right edge to resize (persisted).
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = loadSidebarWidth();
    document.body.classList.add("sidebar-resizing");
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX),
      );
      setSidebarWidth(w);
    };
    const onUp = (ev: MouseEvent) => {
      const w = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX),
      );
      localStorage.setItem("ui.sidebarWidth", String(w));
      document.body.classList.remove("sidebar-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        {!sidebarCollapsed && (
          <aside
            className="app-sidebar"
            style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          >
            <Sidebar />
            <div
              className="sidebar-resizer"
              onMouseDown={startResize}
              title="拖拽调整侧边栏宽度"
            />
          </aside>
        )}
        <div className="app-main">
          <div className="breadcrumb-bar">
            <Breadcrumb />
            {/* document views portal their action buttons (save state /
                viewers / star / comments / history) into this slot */}
            <div className="breadcrumb-actions" id="doc-actions-slot" />
          </div>
          <main
            ref={contentRef}
            className={`app-content ${fullWidth || contentWidth === 5 ? "full-width" : ""}`}
            data-content-width={contentWidth}
          >
            <Outlet />
            {showTop && (
              <button
                className="scroll-top-button"
                onClick={() =>
                  contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                }
                title="回到顶部"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3.5l5 5-1.06 1.06L8 5.62 4.06 9.56 3 8.5l5-5z" />
                </svg>
              </button>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
