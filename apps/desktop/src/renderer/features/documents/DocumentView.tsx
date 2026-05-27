import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import type { OutlineDocument } from "@outline/shared-types";
import "./DocumentView.css";

interface DocumentInfoResponse {
  data: OutlineDocument;
}

export default function DocumentView(): React.ReactElement {
  const api = useElectronAPI();
  const { documentId } = useParams<{ documentId: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "document", documentId],
    queryFn: () =>
      api.documents.info(activeProfileId!, documentId!) as Promise<DocumentInfoResponse>,
    enabled: !!activeProfileId && !!documentId,
  });

  if (!documentId) {
    return (
      <div className="document-empty">
        <p>Select a document to view</p>
      </div>
    );
  }

  const doc = data?.data;

  return (
    <div className="document-view">
      {isLoading && (
        <div className="document-loading">Loading document…</div>
      )}
      {error && (
        <div className="document-error">Failed to load document</div>
      )}
      {doc && (
        <article className="document-article">
          <header className="document-header">
            <h1 className="document-title">
              {doc.emoji && (
                <span className="document-emoji">{doc.emoji}</span>
              )}
              {doc.title || "Untitled"}
            </h1>
            <div className="document-meta">
              <span>
                Updated {new Date(doc.updatedAt).toLocaleDateString()}
              </span>
              {doc.createdBy && <span>by {doc.createdBy.name}</span>}
            </div>
          </header>
          <div className="document-body">
            <MarkdownRenderer content={doc.text} />
          </div>
        </article>
      )}
    </div>
  );
}
