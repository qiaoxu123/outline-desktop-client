import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
import { useDiscussNewTopicCount } from "../../features/discuss/useDiscuss";
import {
  ACTIVITY_ENTRIES,
  useActivityBarOrder,
  type ActivityEntry,
} from "./activityBarOrder";
import "./ActivityBar.css";

const VISIBILITY_KEY = "ui.activityBar.visible";

function loadVisible(): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set(ACTIVITY_ENTRIES.map((e) => e.key));
}

function saveVisible(s: Set<string>): void {
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...s]));
}

type DropPos = "before" | "after";

/* ---------- component ---------- */

export default function ActivityBar(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const discussNew = useDiscussNewTopicCount();

  const [visible, setVisible] = useState<Set<string>>(loadVisible);
  const [order, setOrder] = useActivityBarOrder();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // DnD state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; pos: DropPos } | null>(null);
  const overRef = useRef(over);
  overRef.current = over;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Build ordered entries list
  const entryMap = new Map(ACTIVITY_ENTRIES.map((e) => [e.key, e]));
  const orderedEntries = order
    .map((key) => entryMap.get(key))
    .filter((e): e is ActivityEntry => !!e);
  const visibleEntries = orderedEntries.filter((e) => visible.has(e.key));

  /** Map routes back to their entry key so the current page highlights. */
  const activeKey = ((): string | null => {
    const path = location.pathname;
    if (path === "/" || path === "") return "home";
    for (const e of ACTIVITY_ENTRIES) {
      if (e.route && path.startsWith(e.route)) return e.key;
    }
    return null;
  })();

  const handleClick = (e: ActivityEntry) => {
    if (e.navigate && e.route) {
      navigate(e.route);
    } else {
      toggleSidebar();
    }
  };

  const toggleEntry = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveVisible(next);
      return next;
    });
  };

  const badge = (key: string): number => {
    if (key === "discuss") return discussNew;
    return 0;
  };

  // ---- drag-and-drop reordering ----

  const performReorder = (fromKey: string, toKey: string, pos: DropPos) => {
    if (fromKey === toKey) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(fromKey);
      if (fromIdx === -1) return prev;
      next.splice(fromIdx, 1);
      const toIdx = next.indexOf(toKey);
      if (toIdx === -1) return prev;
      next.splice(pos === "before" ? toIdx : toIdx + 1, 0, fromKey);
      return next;
    });
  };

  // Global mouseup to complete the drag (fires even outside the activity bar)
  useEffect(() => {
    if (!dragKey) return;
    const onUp = () => {
      const cur = overRef.current;
      if (cur) performReorder(dragKey, cur.key, cur.pos);
      setDragKey(null);
      setOver(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragKey]);

  return (
    <div className="activity-bar">
      {/* top: sidebar toggle + nav entries */}
      <div className="act-top">
        <button
          className={`act-btn ${!sidebarCollapsed ? "act-active" : ""}`}
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
        >
          <OIcon name="sidebar" size={18} />
        </button>

        <div className="act-divider" />

        {visibleEntries.map((e) => {
          const isActive = activeKey === e.key;
          const b = badge(e.key);
          const dragging = dragKey === e.key ? "act-dragging" : "";
          const dropClass =
            over?.key === e.key ? `act-drop-${over.pos}` : "";
          return (
            <button
              key={e.key}
              className={`act-btn ${isActive ? "act-active" : ""} ${dragging} ${dropClass}`}
              onMouseDown={(ev) => {
                if (ev.button !== 0) return;
                ev.preventDefault();
                setDragKey(e.key);
              }}
              onMouseMove={(ev) => {
                if (!dragKey || dragKey === e.key) return;
                const r = ev.currentTarget.getBoundingClientRect();
                const y = (ev.clientY - r.top) / r.height;
                const pos: DropPos = y < 0.5 ? "before" : "after";
                setOver((o) =>
                  o?.key === e.key && o.pos === pos ? o : { key: e.key, pos },
                );
              }}
              onClick={() => handleClick(e)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setMenu({ x: ev.clientX, y: ev.clientY });
              }}
              title={e.label}
            >
              <OIcon name={e.icon} size={18} />
              {b > 0 && (
                <span className="act-badge" title={`${b} 条新动态`}>
                  {b > 99 ? "99+" : b}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* bottom: settings */}
      <div className="act-bottom">
        <button
          className={`act-btn ${location.pathname === "/settings" ? "act-active" : ""}`}
          onClick={() => navigate("/settings")}
          title="设置"
        >
          <OIcon name="settings" size={18} />
        </button>
      </div>

      {/* right-click context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="sb-menu"
          style={{ position: "fixed", top: menu.y + 4, left: menu.x }}
        >
          <div className="sb-menu-label">显示/隐藏快捷入口</div>
          <div className="sb-menu-divider" />
          {orderedEntries.map((e) => (
            <button
              key={e.key}
              className="sb-menu-item"
              onClick={() => {
                toggleEntry(e.key);
                setMenu(null);
              }}
            >
              <span className="act-check">
                {visible.has(e.key) ? "✓" : " "}
              </span>
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
