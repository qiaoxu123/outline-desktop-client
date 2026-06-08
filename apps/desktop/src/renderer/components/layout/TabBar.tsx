import { useNavigate, useLocation } from "react-router-dom";
import { useTabsStore } from "../../state/uiStore";
import "./TabBar.css";

/** Browser-style tabs for the documents the user has open. */
export default function TabBar(): React.ReactElement | null {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTabsStore((s) => s.tabs);
  const closeTab = useTabsStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  const activeId = location.pathname.startsWith("/document/")
    ? location.pathname.slice("/document/".length)
    : null;

  const onClose = (e: React.MouseEvent, documentId: string) => {
    e.stopPropagation();
    const neighbour = closeTab(documentId);
    if (documentId === activeId) {
      navigate(neighbour ? `/document/${neighbour}` : "/");
    }
  };

  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.documentId}
          className={`tab ${tab.documentId === activeId ? "active" : ""}`}
          onClick={() => navigate(`/document/${tab.documentId}`)}
          onAuxClick={(e) => e.button === 1 && onClose(e, tab.documentId)}
          title={tab.title}
        >
          {tab.emoji && <span className="tab-emoji">{tab.emoji}</span>}
          <span className="tab-title">{tab.title || "Untitled"}</span>
          <button
            className="tab-close"
            onClick={(e) => onClose(e, tab.documentId)}
            title="关闭标签"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
