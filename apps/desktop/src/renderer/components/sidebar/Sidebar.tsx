import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore, useProfileStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import type { OutlineCollection } from "@outline/shared-types";
import "./Sidebar.css";

interface CollectionListResponse {
  data: OutlineCollection[];
}

export default function Sidebar(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectedCollectionId = useUIStore((s) => s.selectedCollectionId);
  const selectCollection = useUIStore((s) => s.selectCollection);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      unwrapIpc<CollectionListResponse>(api.collections.list(activeProfileId!)),
    enabled: !!activeProfileId,
  });

  const collections = data?.data ?? [];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <a
          href="#/"
          className={`sidebar-home-link ${!selectedCollectionId ? "active" : ""}`}
          onClick={() => selectCollection(null)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M9 1L2 5v8l7 4 7-4V5L9 1z" />
          </svg>
          <span>Home</span>
        </a>
      </div>

      <div className="sidebar-body">
        {isLoading && (
          <div className="sidebar-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="sidebar-skeleton"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        )}
        {error && (
          <div className="sidebar-error">
            <p>Failed to load collections</p>
          </div>
        )}
        {!isLoading && !error && (
          <div className="sidebar-collections">
            {collections.map((col) => (
              <a
                key={col.id}
                href={`#/collection/${col.id}`}
                className={`sidebar-collection-item ${selectedCollectionId === col.id ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  selectCollection(col.id);
                  navigate(`/collection/${col.id}`);
                }}
              >
                <span
                  className="sidebar-collection-dot"
                  style={{ backgroundColor: col.color || "#4c6ef5" }}
                />
                <span className="sidebar-collection-name">{col.name}</span>
                {col.documentCount !== undefined && col.documentCount > 0 && (
                  <span className="sidebar-collection-count">
                    {col.documentCount}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <span className="sidebar-footer-name">
          {activeProfile?.name || "Outline"}
        </span>
      </div>
    </div>
  );
}
