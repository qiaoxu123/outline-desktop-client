import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore, useProfileStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
} from "@outline/shared-types";
import "./Sidebar.css";

interface CollectionListResponse {
  data: OutlineCollection[];
}

interface CollectionDocumentsResponse {
  data: OutlineCollectionDocument[];
}

function Chevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.12s",
        flexShrink: 0,
      }}
    >
      <path d="M6 3.5l5 4.5-5 4.5V3.5z" />
    </svg>
  );
}

/** Recursive document node with its own expand state for children. */
function DocNode({
  doc,
  depth,
  expanded,
  toggle,
}: {
  doc: OutlineCollectionDocument;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const hasChildren = doc.children && doc.children.length > 0;
  const isOpen = expanded.has(doc.id);

  return (
    <div>
      <div
        className={`sidebar-doc-item ${selectedDocumentId === doc.id ? "active" : ""}`}
        style={{ paddingLeft: `${20 + depth * 14}px` }}
      >
        <button
          className={`sidebar-doc-chevron ${hasChildren ? "" : "hidden"}`}
          onClick={() => hasChildren && toggle(doc.id)}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? <Chevron open={isOpen} /> : <span className="sidebar-doc-bullet" />}
        </button>
        <a
          href={`#/document/${doc.id}`}
          className="sidebar-doc-link"
          onClick={(e) => {
            e.preventDefault();
            selectDocument(doc.id);
            navigate(`/document/${doc.id}`);
          }}
          title={doc.title || "Untitled"}
        >
          {doc.emoji && <span className="sidebar-doc-emoji">{doc.emoji}</span>}
          <span className="sidebar-doc-title">{doc.title || "Untitled"}</span>
        </a>
      </div>
      {hasChildren && isOpen && (
        <div>
          {doc.children.map((child) => (
            <DocNode
              key={child.id}
              doc={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Lazy-loaded document tree for one expanded collection. */
function CollectionTree({
  collectionId,
}: {
  collectionId: string;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "collection", collectionId, "documents"],
    queryFn: () =>
      unwrapIpc<CollectionDocumentsResponse>(
        api.collections.documents(activeProfileId!, collectionId),
      ),
    enabled: !!activeProfileId,
  });

  if (isLoading) {
    return <div className="sidebar-tree-loading">加载中…</div>;
  }
  if (error) {
    return <div className="sidebar-tree-loading">加载失败</div>;
  }

  const documents = data?.data ?? [];
  if (documents.length === 0) {
    return <div className="sidebar-tree-loading">（空集合）</div>;
  }

  return (
    <div className="sidebar-tree">
      {documents.map((doc) => (
        <DocNode key={doc.id} doc={doc} depth={0} expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

export default function Sidebar(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectedCollectionId = useUIStore((s) => s.selectedCollectionId);
  const selectCollection = useUIStore((s) => s.selectCollection);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(),
  );

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
            {collections.map((col) => {
              const isOpen = expandedCollections.has(col.id);
              return (
                <div key={col.id}>
                  <div
                    className={`sidebar-collection-item ${selectedCollectionId === col.id ? "active" : ""}`}
                  >
                    <button
                      className="sidebar-collection-chevron"
                      onClick={() => toggleCollection(col.id)}
                      title={isOpen ? "收起" : "展开"}
                    >
                      <Chevron open={isOpen} />
                    </button>
                    <a
                      href={`#/collection/${col.id}`}
                      className="sidebar-collection-link"
                      onClick={(e) => {
                        e.preventDefault();
                        selectCollection(col.id);
                        if (!isOpen) toggleCollection(col.id);
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
                  </div>
                  {isOpen && <CollectionTree collectionId={col.id} />}
                </div>
              );
            })}
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
