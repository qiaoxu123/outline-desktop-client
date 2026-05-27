import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import type { OutlineCollectionDocument } from "@outline/shared-types";
import "./CollectionsView.css";

interface CollectionDocumentsResponse {
  data: OutlineCollectionDocument[];
}

export default function CollectionsView(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const { collectionId } = useParams<{ collectionId?: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectCollection = useUIStore((s) => s.selectCollection);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "profile",
      activeProfileId,
      "collection",
      collectionId,
      "documents",
    ],
    queryFn: () =>
      api.collections.documents(
        activeProfileId!,
        collectionId ?? "",
      ) as Promise<CollectionDocumentsResponse>,
    enabled: !!activeProfileId && !!collectionId,
  });

  if (!collectionId) {
    return (
      <div className="collections-home">
        <div className="home-hero">
          <div className="home-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="16" fill="#e8edff" />
              <path
                d="M20 24h24v3H20v-3zm0 8h24v3H20v-3zm0 8h16v3H20v-3z"
                fill="#4c6ef5"
              />
            </svg>
          </div>
          <h2>JLUMCNS-MEC Knowledge Base</h2>
          <p>
            Select a collection from the sidebar to browse documents, or use
            search to find specific content.
          </p>
        </div>
      </div>
    );
  }

  const documents = data?.data ?? [];

  return (
    <div className="collections-view">
      {isLoading && (
        <div className="collections-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="collections-skeleton"
              style={{ width: `${70 + Math.random() * 25}%` }}
            />
          ))}
        </div>
      )}
      {error && (
        <div className="collections-error">
          <p>Failed to load documents. Please check your connection.</p>
        </div>
      )}
      {!isLoading && !error && documents.length === 0 && (
        <div className="collections-empty-list">
          <p>This collection is empty</p>
        </div>
      )}
      <div className="document-tree">
        <DocumentTree
          documents={documents}
          onSelect={(docId) => {
            navigate(`/document/${docId}`);
          }}
        />
      </div>
    </div>
  );
}

function DocumentTree({
  documents,
  onSelect,
  depth = 0,
}: {
  documents: OutlineCollectionDocument[];
  onSelect: (id: string) => void;
  depth?: number;
}): React.ReactElement {
  return (
    <>
      {documents.map((doc) => (
        <div key={doc.id}>
          <a
            href={`#/document/${doc.id}`}
            className="document-tree-item"
            style={{ paddingLeft: `${16 + depth * 20}px` }}
            onClick={(e) => {
              e.preventDefault();
              onSelect(doc.id);
            }}
          >
            <span className="document-tree-icon">
              {doc.emoji ? (
                <span className="document-tree-emoji">{doc.emoji}</span>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="currentColor"
                  className="document-tree-doc-icon"
                >
                  <path d="M4 2h7l4 4v10H4V2zm1 1v12h8V6.5H9V3H5z" />
                </svg>
              )}
            </span>
            <span className="document-tree-title">
              {doc.title || "Untitled"}
            </span>
          </a>
          {doc.children?.length > 0 && (
            <DocumentTree
              documents={doc.children}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}
