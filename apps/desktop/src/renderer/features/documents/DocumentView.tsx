import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import type { OutlineDocument } from "@outline/shared-types";
import "./DocumentView.css";

interface DocumentInfoResponse {
  data: OutlineDocument;
}

export default function DocumentView(): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const { documentId } = useParams<{ documentId: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [saveError, setSaveError] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "document", documentId],
    queryFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.info(activeProfileId!, documentId!),
      ),
    enabled: !!activeProfileId && !!documentId,
  });

  const doc = data?.data;

  const saveMutation = useMutation({
    mutationFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.update(activeProfileId!, {
          id: documentId!,
          title: draftTitle,
          text: draftText,
        }),
      ),
    onSuccess: () => {
      setEditing(false);
      setSaveError("");
      // refresh the document and any sidebar trees that show its title
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    },
  });

  if (!documentId) {
    return (
      <div className="document-empty">
        <p>Select a document to view</p>
      </div>
    );
  }

  const startEditing = () => {
    if (!doc) return;
    setDraftTitle(doc.title);
    setDraftText(doc.text);
    setSaveError("");
    setEditing(true);
  };

  return (
    <div className="document-view">
      {isLoading && <div className="document-loading">加载文档中…</div>}
      {error && <div className="document-error">文档加载失败</div>}

      {doc && !editing && (
        <article className="document-article">
          <header className="document-header">
            <div className="document-header-row">
              <h1 className="document-title">
                {doc.emoji && (
                  <span className="document-emoji">{doc.emoji}</span>
                )}
                {doc.title || "Untitled"}
              </h1>
              <button className="document-edit-button" onClick={startEditing}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5z" />
                </svg>
                编辑
              </button>
            </div>
            <div className="document-meta">
              <span>
                更新于 {new Date(doc.updatedAt).toLocaleDateString()}
              </span>
              {doc.updatedBy && <span>by {doc.updatedBy.name}</span>}
            </div>
          </header>
          <div className="document-body">
            <MarkdownRenderer content={doc.text} />
          </div>
        </article>
      )}

      {doc && editing && (
        <div className="document-editor">
          <div className="document-editor-toolbar">
            <input
              className="document-editor-title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="标题"
              disabled={saveMutation.isPending}
            />
            <div className="document-editor-actions">
              {saveError && (
                <span className="document-editor-error">{saveError}</span>
              )}
              <button
                className="document-editor-cancel"
                onClick={() => setEditing(false)}
                disabled={saveMutation.isPending}
              >
                取消
              </button>
              <button
                className="document-editor-save"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !draftTitle.trim()}
              >
                {saveMutation.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
          <div className="document-editor-split">
            <textarea
              className="document-editor-textarea"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="使用 Markdown 编写…"
              disabled={saveMutation.isPending}
              spellCheck={false}
            />
            <div className="document-editor-preview">
              <MarkdownRenderer content={draftText} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
