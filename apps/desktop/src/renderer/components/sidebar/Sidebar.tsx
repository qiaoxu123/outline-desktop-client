import { useQuery } from "@tanstack/react-query";
import { useUIStore, useProfileStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import type { OutlineCollection } from "@outline/shared-types";
import "./Sidebar.css";

interface CollectionListResponse {
  data: OutlineCollection[];
}

export default function Sidebar(): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectedCollectionId = useUIStore((s) => s.selectedCollectionId);
  const selectCollection = useUIStore((s) => s.selectCollection);
  const profiles = useProfileStore((s) => s.profiles);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      api.collections.list(activeProfileId!) as Promise<CollectionListResponse>,
    enabled: !!activeProfileId,
  });

  if (!activeProfileId) {
    return (
      <div className="sidebar-empty">
        <p>No workspace selected</p>
        <a href="#/settings" className="sidebar-link">
          Add a workspace in Settings
        </a>
      </div>
    );
  }

  const collections = data?.data ?? [];

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Collections</span>
        </div>
        {isLoading && <div className="sidebar-loading">Loading…</div>}
        {error && (
          <div className="sidebar-error">Failed to load collections</div>
        )}
        <ul className="sidebar-tree">
          {collections.map((col) => (
            <li
              key={col.id}
              className={`sidebar-tree-item ${selectedCollectionId === col.id ? "active" : ""}`}
              onClick={() => selectCollection(col.id)}
            >
              <span
                className="sidebar-collection-color"
                style={{ backgroundColor: col.color || "#4c6ef5" }}
              />
              <span className="sidebar-collection-name">{col.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-footer-info">
          {profiles.find((p) => p.id === activeProfileId)?.name}
        </div>
      </div>
    </div>
  );
}
