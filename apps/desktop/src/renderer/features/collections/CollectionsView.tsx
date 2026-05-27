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

  if (!activeProfileId) {
    return (
      <div className="collections-empty">
        <h2>Outline Desktop</h2>
        <p>Select a workspace from the top bar to get started.</p>
      </div>
    );
  }

  if (!collectionId) {
    return (
      <div className="collections-empty">
        <h2>Collections</h2>
        <p>Select a collection from the sidebar to view its documents.</p>
      </div>
    );
  }

  const documents = data?.data ?? [];

  return (
    <div className="collections-view">
      {isLoading && (
        <div className="collections-loading">Loading documents…</div>
      )}
      {error && (
        <div className="collections-error">Failed to load documents</div>
      )}
      <div className="document-list">
        <DocumentTree
          documents={documents}
          onSelect={(docId) => navigate(`/document/${docId}`)}
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
          <button
            className="document-tree-item"
            style={{ paddingLeft: `${16 + depth * 20}px` }}
            onClick={() => onSelect(doc.id)}
          >
            <span className="document-tree-emoji">{doc.emoji || "\u{1F4C4}"}</span>
            <span className="document-tree-title">
              {doc.title || "Untitled"}
            </span>
          </button>
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
