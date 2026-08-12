import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
import { useDiscussNewTopicCount } from "../../features/discuss/useDiscuss";
import {
  ACTIVITY_ENTRIES,
  useActivityBarOrder,
  type ActivityEntry,
  useSidebarMode,
} from "./activityBarOrder";

const VISIBILITY_KEY = "ui.activityBar.visible";

function loadVisible(): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* */ }
  return new Set(ACTIVITY_ENTRIES.map((e) => e.key));
}

/**
 * Inline nav row rendered at the top of the sidebar when sidebarMode is
 * "integrated". Shows the same entries as ActivityBar but as a horizontal
 * icon row below the team header, replacing the separate vertical strip.
 */
export default function SidebarNav(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const discussNew = useDiscussNewTopicCount();
  const [order] = useActivityBarOrder();

  const visible = loadVisible();
  const entryMap = new Map(ACTIVITY_ENTRIES.map((e) => [e.key, e]));
  const orderedEntries = order
    .map((key) => entryMap.get(key))
    .filter((e): e is ActivityEntry => !!e);
  const visibleEntries = orderedEntries.filter((e) => visible.has(e.key));

  const activeKey = ((): string | null => {
    const path = location.pathname;
    if (path === "/" || path === "") return "home";
    for (const e of ACTIVITY_ENTRIES) {
      if (e.route && path.startsWith(e.route)) return e.key;
    }
    return null;
  })();

  const badge = (key: string): number => {
    if (key === "discuss") return discussNew;
    return 0;
  };

  return (
    <div className="sb-quick-nav">
      {visibleEntries.map((e) => {
        const isActive = activeKey === e.key;
        const b = badge(e.key);
        return (
          <button
            key={e.key}
            className={`sb-nav-icon${isActive ? " active" : ""}`}
            onClick={() => { if (e.route) navigate(e.route); }}
            title={e.label}
          >
            <OIcon name={e.icon} size={18} />
            {b > 0 && (
              <span className="sb-badge" title={`${b} 条新动态`}>
                {b > 99 ? "99+" : b}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
