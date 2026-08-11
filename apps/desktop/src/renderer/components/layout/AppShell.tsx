import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import NotesSidebar from "../sidebar/NotesSidebar";
import ActivityBar from "../sidebar/ActivityBar";
import TitleBar from "./TitleBar";
import Breadcrumb from "./Breadcrumb";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
import "./AppShell.css";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;

function loadSidebarWidth(): number {
  const v = Number(localStorage.getItem("ui.sidebarWidth"));
  return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : 260;
}

export default function AppShell(): React.ReactElement {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const contentWidth = useUIStore((s) => s.contentWidth);
  const contentRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const location = useLocation();
  const isNotesRoute = location.pathname.startsWith("/notes");
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Per-route scroll memory. All routes share this one scroll container, so
  // without this, leaving a long document and returning to a list view kept
  // the document's scroll offset (list appeared scrolled mid-way). Each
  // route's offset is saved on leave and restored (or reset to top) on entry.
  const scrollMemory = useRef(new Map<string, number>());
  const prevPathRef = useRef(location.pathname);
  useLayoutEffect(() => {
    const el = contentRef.current;
    const path = location.pathname;
    const prev = prevPathRef.current;
    if (!el || prev === path) return;
    scrollMemory.current.set(prev, el.scrollTop);
    prevPathRef.current = path;
    el.scrollTop = scrollMemory.current.get(path) ?? 0;
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <ActivityBar />
        {!sidebarCollapsed && (
          <aside
            className={`app-sidebar${isNotesRoute ? " notes-sidebar" : ""}`}
            style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          >
            {isNotesRoute ? (
              <NotesSidebar
                activeTag={searchParams.get("tag")}
                selectedDay={searchParams.get("day")}
                onSelectTag={(t) =>
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    if (t) next.set("tag", t);
                    else next.delete("tag");
                    return next;
                  })
                }
                onSelectDay={(d) =>
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    if (d) next.set("day", d);
                    else next.delete("day");
                    return next;
                  })
                }
                onClearTag={() =>
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("tag");
                    next.delete("day");
                    return next;
                  })
                }
              />
            ) : (
              <Sidebar />
            )}
            {!isNotesRoute && (
              <div
                className="sidebar-resizer"
                onMouseDown={startResize}
                title="拖拽调整侧边栏宽度"
              />
            )}
          </aside>
        )}
        <div className="app-main">
          <div className="breadcrumb-bar">
            <Breadcrumb />
            {/* document views portal their action buttons (save state /
                viewers / star / comments / history) into this slot */}
            <div className="breadcrumb-actions" id="doc-actions-slot" />
          </div>
          <div className="app-content-row">
            <main
              ref={contentRef}
              className={`app-content ${contentWidth === 5 ? "full-width" : ""}`}
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
                  <OIcon name="caretUp" size={20} />
                </button>
              )}
            </main>
            {/* document views portal the TOC here — a docked, independently
                scrolling rail at the far right, outside the content scroller */}
            <div className="toc-slot" id="toc-slot" />
          </div>
        </div>
      </div>
    </div>
  );
}
