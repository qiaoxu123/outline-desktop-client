import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTabsStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
import "./TabBar.css";

interface TabMenuState {
  documentId: string;
  x: number;
  y: number;
}

/** Browser-style tabs for the documents the user has open. */
export default function TabBar(): React.ReactElement | null {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTabsStore((s) => s.tabs);
  const closeTab = useTabsStore((s) => s.closeTab);
  const togglePin = useTabsStore((s) => s.togglePin);
  const closeOthers = useTabsStore((s) => s.closeOthers);
  const closeAll = useTabsStore((s) => s.closeAll);
  const [menu, setMenu] = useState<TabMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (tabs.length === 0) return null;

  const activeId = location.pathname.startsWith("/document/")
    ? location.pathname.slice("/document/".length)
    : null;

  /** After bulk-closing, land somewhere sensible if the active tab is gone. */
  const ensureActiveVisible = () => {
    const remaining = useTabsStore.getState().tabs;
    if (activeId && !remaining.some((t) => t.documentId === activeId)) {
      navigate(remaining[0] ? `/document/${remaining[0].documentId}` : "/");
    }
  };

  const onClose = (e: React.MouseEvent, documentId: string) => {
    e.stopPropagation();
    const neighbour = closeTab(documentId);
    if (documentId === activeId) {
      navigate(neighbour ? `/document/${neighbour}` : "/");
    }
  };

  const menuTab = menu ? tabs.find((t) => t.documentId === menu.documentId) : null;

  const menuItem = (label: string, action: () => void): React.ReactElement => (
    <button
      key={label}
      className="sb-menu-item"
      onClick={() => {
        setMenu(null);
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.documentId}
          className={`tab ${tab.documentId === activeId ? "active" : ""} ${tab.pinned ? "pinned" : ""}`}
          onClick={() => navigate(`/document/${tab.documentId}`)}
          onAuxClick={(e) => e.button === 1 && onClose(e, tab.documentId)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ documentId: tab.documentId, x: e.clientX, y: e.clientY });
          }}
          title={tab.title}
        >
          {tab.pinned && (
            <span className="tab-pin"><OIcon name="pin" size={12} /></span>
          )}
          {tab.emoji && <span className="tab-emoji">{tab.emoji}</span>}
          <span className="tab-title">{tab.title || "Untitled"}</span>
          {!tab.pinned && (
            <button
              className="tab-close"
              onClick={(e) => onClose(e, tab.documentId)}
              title="关闭标签"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {menu && menuTab && (
        <div
          ref={menuRef}
          className="sb-menu"
          style={{ position: "fixed", top: menu.y + 4, left: menu.x }}
        >
          {menuItem(menuTab.pinned ? "取消固定" : "固定标签页", () =>
            togglePin(menu.documentId),
          )}
          {!menuTab.pinned &&
            menuItem("关闭标签页", () => {
              const neighbour = closeTab(menu.documentId);
              if (menu.documentId === activeId) {
                navigate(neighbour ? `/document/${neighbour}` : "/");
              }
            })}
          <div className="sb-menu-divider" />
          {menuItem("关闭其他标签页", () => {
            closeOthers(menu.documentId);
            ensureActiveVisible();
          })}
          {menuItem("关闭全部标签页", () => {
            closeAll();
            ensureActiveVisible();
          })}
        </div>
      )}
    </div>
  );
}
