import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import {
  useUserInfo,
  useStars,
  useToggleStar,
  canUserEdit,
} from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import {
  useMarkdownEditor,
  getMarkdown,
  MarkdownEditorContent,
} from "./Editor";
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
  const { user } = useUserInfo();
  const { starFor } = useStars();
  const { toggle: toggleStar, isPending: starPending } = useToggleStar();
  const editable = canUserEdit(user);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
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
  const editor = useMarkdownEditor(editing && doc ? doc.text : "", editing);

  const saveMutation = useMutation({
    mutationFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.update(activeProfileId!, {
          id: documentId!,
          title: draftTitle,
          text: editor ? getMarkdown(editor) : doc?.text ?? "",
        }),
      ),
    onSuccess: () => {
      setEditing(false);
      setSaveError("");
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    },
  });

  // Ctrl/Cmd+S saves while editing
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saveMutation.isPending && draftTitle.trim()) saveMutation.mutate();
      }
      if (e.key === "Escape") {
        setEditing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, draftTitle, saveMutation]);

  if (!documentId) {
    return (
      <div className="document-empty">
        <p>从侧边栏选择一篇文档</p>
      </div>
    );
  }

  const star = starFor(documentId);

  const startEditing = () => {
    if (!doc) return;
    setDraftTitle(doc.title);
    setSaveError("");
    setEditing(true);
  };

  return (
    <div className="document-view">
      {isLoading && <div className="document-loading">加载文档中…</div>}
      {!!error && <div className="document-error">文档加载失败</div>}

      {doc && (
        <article className="document-article">
          <header className="document-header">
            <div className="document-header-row">
              {editing ? (
                <input
                  className="document-title-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="标题"
                  disabled={saveMutation.isPending}
                  autoFocus
                />
              ) : (
                <h1 className="document-title">
                  {doc.emoji && (
                    <span className="document-emoji">{doc.emoji}</span>
                  )}
                  {doc.title || "Untitled"}
                </h1>
              )}

              <div className="document-actions">
                {saveError && (
                  <span className="document-save-error">{saveError}</span>
                )}
                <button
                  className={`document-icon-button ${star ? "starred" : ""}`}
                  onClick={() => toggleStar(documentId, star)}
                  disabled={starPending}
                  title={star ? "取消星标" : "加星标"}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16"
                    fill={star ? "var(--color-star)" : "none"}
                    stroke={star ? "var(--color-star)" : "currentColor"}
                    strokeWidth="1.4"
                  >
                    <path d="M8 1.5l1.94 3.93 4.34.63-3.14 3.06.74 4.32L8 11.4l-3.88 2.04.74-4.32L1.72 6.06l4.34-.63L8 1.5z" />
                  </svg>
                </button>

                {editable && !editing && (
                  <button className="document-button" onClick={startEditing}>
                    编辑
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      className="document-button subtle"
                      onClick={() => setEditing(false)}
                      disabled={saveMutation.isPending}
                    >
                      取消
                    </button>
                    <button
                      className="document-button primary"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !draftTitle.trim()}
                    >
                      {saveMutation.isPending ? "保存中…" : "保存"}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="document-meta">
              <span>更新于 {new Date(doc.updatedAt).toLocaleDateString()}</span>
              {doc.updatedBy && <span>by {doc.updatedBy.name}</span>}
              {editing && <span className="document-meta-hint">⌘/Ctrl+S 保存 · Esc 取消</span>}
            </div>
          </header>

          <div className="document-body">
            {editing ? (
              <MarkdownEditorContent editor={editor} />
            ) : (
              <MarkdownRenderer content={doc.text} />
            )}
          </div>
        </article>
      )}
    </div>
  );
}
