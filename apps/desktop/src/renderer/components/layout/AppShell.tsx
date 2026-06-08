import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import TitleBar from "./TitleBar";
import TabBar from "./TabBar";
import { useUIStore } from "../../state/uiStore";
import "./AppShell.css";

export default function AppShell(): React.ReactElement {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const fullWidth = useUIStore((s) => s.fullWidth);
  const contentRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false);

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
          <aside className="app-sidebar">
            <Sidebar />
          </aside>
        )}
        <div className="app-main">
          <TabBar />
          <main
            ref={contentRef}
            className={`app-content ${fullWidth ? "full-width" : ""}`}
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
