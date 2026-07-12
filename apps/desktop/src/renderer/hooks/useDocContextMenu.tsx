import { useEffect, useRef, useState } from "react";
import { useTabsStore, type DocTab } from "../state/uiStore";

/**
 * Lightweight right-click menu for list rows that represent a document
 * (讨论区 topics, 论文库 papers, …). Offers 在新标签页打开 — adds the tab in
 * the background without navigating, same as the sidebar row menu.
 * Reuses the global .sb-menu styles from Sidebar.css.
 */
export function useDocContextMenu(): {
  /** Render this once at the view root (null while closed). */
  menu: React.ReactElement | null;
  onContextMenu: (e: React.MouseEvent, doc: DocTab) => void;
} {
  const openTab = useTabsStore((s) => s.openTab);
  const [state, setState] = useState<{
    doc: DocTab;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [state]);

  const menu = state ? (
    <div
      ref={menuRef}
      className="sb-menu"
      style={{ top: state.y + 4, left: state.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="sb-menu-item"
        onClick={() => {
          openTab(state.doc);
          setState(null);
        }}
      >
        在新标签页打开
      </button>
    </div>
  ) : null;

  return {
    menu,
    onContextMenu: (e, doc) => {
      e.preventDefault();
      e.stopPropagation();
      setState({ doc, x: e.clientX, y: e.clientY });
    },
  };
}
