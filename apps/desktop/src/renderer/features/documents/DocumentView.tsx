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

/* ---------- table of contents ---------- */

interface Heading {
  level: number;
  text: string;
}

function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,4})\s+(.+)/.exec(line);
    if (m) {
      out.push({
        level: m[1].length,
        text: m[2].replace(/[#*`_[\]]/g, "").trim(),
      });
    }
  }
  return out;
}

function Toc({ markdown }: { markdown: string }): React.ReactElement | null {
  const headings = extractHeadings(markdown);
  if (headings.length === 0) return null;

  const scrollTo = (index: number) => {
    const els = document.querySelectorAll(
      ".document-body h1, .document-body h2, .document-body h3, .document-body h4",
    );
    els[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="document-toc">
      <div className="document-toc-title">目录</div>
      {headings.map((h, i) => (
        <button
          key={`${i}-${h.text}`}
          className="document-toc-item"
          style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
          onClick={() => scrollTo(i)}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}

/* ---------- revision history ---------- */

interface Revision {
  id: string;
  title: string;
  createdAt: string;
  createdBy?: { name: string };
}

function HistoryPanel({
  documentId,
  onClose,
  onRestored,
}: {
  documentId: string;
  onClose: () => void;
  onRestored: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "revisions", documentId],
    queryFn: () =>
      unwrapIpc<{ data: Revision[] }>(
        api.call(activeProfileId!, "revisions.list", { documentId }),
      ),
    enabled: !!activeProfileId,
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) =>
      unwrapIpc(
        api.call(activeProfileId!, "documents.restore", {
          id: documentId,
          revisionId,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
      onRestored();
      onClose();
    },
  });

  const revisions = data?.data ?? [];

  return (
    <div className="history-panel">
      <div className="history-header">
        <span>历史版本</span>
        <button className="history-close" onClick={onClose} title="关闭">
          ✕
        </button>
      </div>
      {isLoading && <p className="history-note">加载中…</p>}
      {!!error && <p className="history-note error">无法加载历史版本</p>}
      {!isLoading && revisions.length === 0 && (
        <p className="history-note">暂无历史版本</p>
      )}
      <div className="history-list">
        {revisions.map((rev, i) => (
          <div key={rev.id} className="history-item">
            <div className="history-item-main">
              <div className="history-item-title">
                {rev.title || "Untitled"}
                {i === 0 && <span className="history-current">当前</span>}
              </div>
              <div className="history-item-meta">
                {rev.createdBy?.name && `${rev.createdBy.name} · `}
                {new Date(rev.createdAt).toLocaleString()}
              </div>
            </div>
            {i > 0 &&
              (confirmId === rev.id ? (
                <button
                  className="history-restore confirm"
                  onClick={() => restoreMutation.mutate(rev.id)}
                  disabled={restoreMutation.isPending}
                >
                  {restoreMutation.isPending ? "还原中…" : "确认还原"}
                </button>
              ) : (
                <button
                  className="history-restore"
                  onClick={() => setConfirmId(rev.id)}
                >
                  还原
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- editable document (remounted per document via key) ---------- */

function EditableDocument({
  doc,
  onRestored,
}: {
  doc: OutlineDocument;
  onRestored: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const showToc = useUIStore((s) => s.showToc);
  const { starFor } = useStars();
  const { toggle: toggleStar, isPending: starPending } = useToggleStar();

  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [liveMarkdown, setLiveMarkdown] = useState(doc.text);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveError, setSaveError] = useState("");

  const editor = useMarkdownEditor(doc.text, true);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      setDirty(true);
      setLiveMarkdown(getMarkdown(editor));
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor]);

  const saveMutation = useMutation({
    mutationFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.update(activeProfileId!, {
          id: doc.id,
          title,
          text: editor ? getMarkdown(editor) : doc.text,
        }),
      ),
    onSuccess: () => {
      setDirty(false);
      setSaveError("");
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    },
  });

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saveMutation.isPending && title.trim() && dirty) {
          saveMutation.mutate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [title, dirty, saveMutation]);

  const star = starFor(doc.id);

  return (
    <div className="document-layout">
      <article className="document-article">
        <header className="document-header">
          <div className="document-header-row">
            <input
              className="document-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="标题"
            />
            <div className="document-actions">
              {saveError && (
                <span className="document-save-error">{saveError}</span>
              )}
              <button
                className={`document-icon-button ${star ? "starred" : ""}`}
                onClick={() => toggleStar(doc.id, star)}
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
              <button
                className="document-button subtle"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                历史
              </button>
              <button
                className="document-button primary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !dirty || !title.trim()}
              >
                {saveMutation.isPending ? "保存中…" : dirty ? "保存" : "已保存"}
              </button>
            </div>
          </div>
          <div className="document-meta">
            <span>更新于 {new Date(doc.updatedAt).toLocaleDateString()}</span>
            {doc.updatedBy && <span>by {doc.updatedBy.name}</span>}
            <span className="document-meta-hint">⌘/Ctrl+S 保存</span>
            {dirty && <span className="document-dirty">未保存</span>}
          </div>
        </header>

        <div className="document-body">
          <MarkdownEditorContent editor={editor} />
        </div>
      </article>

      {showToc && !historyOpen && <Toc markdown={liveMarkdown} />}
      {historyOpen && (
        <HistoryPanel
          documentId={doc.id}
          onClose={() => setHistoryOpen(false)}
          onRestored={onRestored}
        />
      )}
    </div>
  );
}

/* ---------- read-only document (viewers) ---------- */

function ReadOnlyDocument({ doc }: { doc: OutlineDocument }): React.ReactElement {
  const showToc = useUIStore((s) => s.showToc);
  const { starFor } = useStars();
  const { toggle: toggleStar, isPending: starPending } = useToggleStar();
  const star = starFor(doc.id);

  return (
    <div className="document-layout">
      <article className="document-article">
        <header className="document-header">
          <div className="document-header-row">
            <h1 className="document-title">
              {doc.emoji && <span className="document-emoji">{doc.emoji}</span>}
              {doc.title || "Untitled"}
            </h1>
            <div className="document-actions">
              <button
                className={`document-icon-button ${star ? "starred" : ""}`}
                onClick={() => toggleStar(doc.id, star)}
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
            </div>
          </div>
          <div className="document-meta">
            <span>更新于 {new Date(doc.updatedAt).toLocaleDateString()}</span>
            {doc.updatedBy && <span>by {doc.updatedBy.name}</span>}
            <span className="document-meta-hint">只读</span>
          </div>
        </header>
        <div className="document-body">
          {doc.text.trim() ? (
            <MarkdownRenderer content={doc.text} />
          ) : (
            <p className="document-blank">此文档暂无内容</p>
          )}
        </div>
      </article>
      {showToc && <Toc markdown={doc.text} />}
    </div>
  );
}

/* ---------- route component ---------- */

export default function DocumentView(): React.ReactElement {
  const api = useElectronAPI();
  const { documentId } = useParams<{ documentId: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const [reloadKey, setReloadKey] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "document", documentId],
    queryFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.info(activeProfileId!, documentId!),
      ),
    enabled: !!activeProfileId && !!documentId,
  });

  if (!documentId) {
    return (
      <div className="document-empty">
        <p>从侧边栏选择一篇文档</p>
      </div>
    );
  }

  const doc = data?.data;

  return (
    <div className="document-view">
      {isLoading && <div className="document-loading">加载文档中…</div>}
      {!!error && (
        <div className="document-error">
          文档加载失败（{error instanceof Error ? error.message : "未知错误"}）
        </div>
      )}
      {doc &&
        (canUserEdit(user) ? (
          <EditableDocument
            key={`${documentId}:${reloadKey}`}
            doc={doc}
            onRestored={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <ReadOnlyDocument doc={doc} />
        ))}
    </div>
  );
}
