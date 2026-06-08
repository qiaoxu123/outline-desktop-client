import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useUIStore, useTabsStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import {
  useUserInfo,
  useStars,
  useToggleStar,
  canUserEdit,
  absoluteUrl,
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

/* ---------- viewers (presence approximation) ---------- */

interface Viewer {
  id: string;
  user: { id: string; name: string; avatarUrl?: string | null };
  lastViewedAt?: string;
}

function Viewers({ documentId }: { documentId: string }): React.ReactElement | null {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  // Refetch periodically so the avatar row reflects who's recently been here.
  const { data } = useQuery({
    queryKey: ["profile", activeProfileId, "views", documentId],
    queryFn: () =>
      unwrapIpc<{ data: Viewer[] }>(
        api.call(activeProfileId!, "views.list", { documentId }),
      ),
    enabled: !!activeProfileId,
    refetchInterval: 30_000,
  });

  const viewers = data?.data ?? [];
  if (viewers.length === 0) return null;

  // Most recent first, cap at 5 avatars + overflow count
  const sorted = [...viewers].sort((a, b) =>
    (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? ""),
  );
  const shown = sorted.slice(0, 5);
  const extra = sorted.length - shown.length;

  return (
    <div className="document-viewers" title="最近查看者">
      {shown.map((v) => {
        const url = absoluteUrl(v.user.avatarUrl);
        return url ? (
          <img
            key={v.id}
            className="viewer-avatar"
            src={url}
            alt={v.user.name}
            title={v.user.name}
          />
        ) : (
          <div
            key={v.id}
            className="viewer-avatar viewer-avatar-fallback"
            title={v.user.name}
          >
            {(v.user.name || "?").slice(0, 1).toUpperCase()}
          </div>
        );
      })}
      {extra > 0 && <div className="viewer-avatar viewer-more">+{extra}</div>}
    </div>
  );
}

/* ---------- comments panel ---------- */

interface Comment {
  id: string;
  data?: { content?: string };
  text?: string;
  createdAt: string;
  createdBy?: { id: string; name: string; avatarUrl?: string | null };
}

function commentText(c: Comment): string {
  // Outline stores rich comment data; fall back to any plain text field.
  if (c.text) return c.text;
  const content = c.data?.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    try {
      return extractProseText(content);
    } catch {
      return "";
    }
  }
  return "";
}

function extractProseText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(extractProseText).join("");
  }
  return "";
}

function CommentsPanel({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [draft, setDraft] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "comments", documentId],
    queryFn: () =>
      unwrapIpc<{ data: Comment[] }>(
        api.call(activeProfileId!, "comments.list", { documentId }),
      ),
    enabled: !!activeProfileId,
  });

  const createMutation = useMutation({
    mutationFn: (text: string) =>
      unwrapIpc(
        api.call(activeProfileId!, "comments.create", {
          documentId,
          // Outline expects ProseMirror doc data; a single paragraph works.
          data: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text }] },
            ],
          },
        }),
      ),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId, "comments", documentId],
      });
    },
  });

  const comments = data?.data ?? [];

  return (
    <div className="comments-panel">
      <div className="comments-header">
        <span>评论{comments.length > 0 ? ` (${comments.length})` : ""}</span>
        <button className="history-close" onClick={onClose} title="关闭">
          ✕
        </button>
      </div>

      {isLoading && <p className="history-note">加载中…</p>}
      {!!error && <p className="history-note error">无法加载评论</p>}
      {!isLoading && comments.length === 0 && (
        <p className="history-note">还没有评论，来写第一条吧。</p>
      )}

      <div className="comments-list">
        {comments.map((c) => {
          const url = absoluteUrl(c.createdBy?.avatarUrl);
          return (
            <div key={c.id} className="comment-item">
              <div className="comment-avatar">
                {url ? (
                  <img src={url} alt={c.createdBy?.name} />
                ) : (
                  <span className="comment-avatar-fallback">
                    {(c.createdBy?.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{c.createdBy?.name}</span>
                  <span className="comment-time">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="comment-text">{commentText(c)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="comments-composer">
        <textarea
          className="comments-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="写下评论…"
          rows={3}
        />
        <button
          className="document-button primary"
          onClick={() => draft.trim() && createMutation.mutate(draft.trim())}
          disabled={createMutation.isPending || !draft.trim()}
        >
          {createMutation.isPending ? "发送中…" : "发表评论"}
        </button>
      </div>
    </div>
  );
}

/* ---------- editor pane (mounted only while editing) ---------- */

function DocEditorPane({
  doc,
  onDone,
}: {
  doc: OutlineDocument;
  onDone: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");

  const editor = useMarkdownEditor(doc.text, true);

  useEffect(() => {
    if (!editor) return;
    const handler = () => setDirty(true);
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
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
      onDone();
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    },
  });

  // Ctrl/Cmd+S to save, Esc to leave the editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saveMutation.isPending && title.trim()) saveMutation.mutate();
      } else if (e.key === "Escape") {
        onDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [title, saveMutation, onDone]);

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
              autoFocus
            />
            <div className="document-actions">
              {saveError && (
                <span className="document-save-error">{saveError}</span>
              )}
              <button
                className="document-button subtle"
                onClick={onDone}
                disabled={saveMutation.isPending}
              >
                取消
              </button>
              <button
                className="document-button primary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !title.trim()}
              >
                {saveMutation.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
          <div className="document-meta">
            <span className="document-meta-hint">
              ⌘/Ctrl+S 保存 · Esc 退出编辑
            </span>
            {dirty && <span className="document-dirty">未保存</span>}
            <span className="document-edit-note">
              提示：复杂公式建议保持源码不动，保存后在阅读视图查看渲染效果
            </span>
          </div>
        </header>

        <div className="document-body">
          <MarkdownEditorContent editor={editor} />
        </div>
      </article>
    </div>
  );
}

/* ---------- document with read view + edit toggle (editors) ---------- */

function EditableDocument({
  doc,
  onRestored,
}: {
  doc: OutlineDocument;
  onRestored: () => void;
}): React.ReactElement {
  const showToc = useUIStore((s) => s.showToc);
  const { starFor } = useStars();
  const { toggle: toggleStar, isPending: starPending } = useToggleStar();
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<"none" | "history" | "comments">("none");
  const star = starFor(doc.id);

  // While editing, the TipTap editor takes over; viewing always uses the
  // proven read pipeline (KaTeX math, centered display, compact tables).
  if (editing) {
    return <DocEditorPane doc={doc} onDone={() => setEditing(false)} />;
  }

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
              <Viewers documentId={doc.id} />
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
                className={`document-icon-button ${panel === "comments" ? "active" : ""}`}
                onClick={() =>
                  setPanel(panel === "comments" ? "none" : "comments")
                }
                title="评论"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
                </svg>
              </button>
              <button
                className={`document-button subtle ${panel === "history" ? "active" : ""}`}
                onClick={() =>
                  setPanel(panel === "history" ? "none" : "history")
                }
              >
                历史
              </button>
              <button
                className="document-button primary"
                onClick={() => setEditing(true)}
              >
                编辑
              </button>
            </div>
          </div>
          <div className="document-meta">
            <span>更新于 {new Date(doc.updatedAt).toLocaleDateString()}</span>
            {doc.updatedBy && <span>by {doc.updatedBy.name}</span>}
          </div>
        </header>

        <div className="document-body">
          {doc.text.trim() ? (
            <MarkdownRenderer content={doc.text} />
          ) : (
            <p className="document-blank">此文档暂无内容，点击右上角“编辑”开始撰写。</p>
          )}
        </div>
      </article>

      {showToc && panel === "none" && <Toc markdown={doc.text} />}
      {panel === "history" && (
        <HistoryPanel
          documentId={doc.id}
          onClose={() => setPanel("none")}
          onRestored={onRestored}
        />
      )}
      {panel === "comments" && (
        <CommentsPanel documentId={doc.id} onClose={() => setPanel("none")} />
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
  const [commentsOpen, setCommentsOpen] = useState(false);

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
              <Viewers documentId={doc.id} />
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
                className={`document-icon-button ${commentsOpen ? "active" : ""}`}
                onClick={() => setCommentsOpen(!commentsOpen)}
                title="评论"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
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
      {showToc && !commentsOpen && <Toc markdown={doc.text} />}
      {commentsOpen && (
        <CommentsPanel documentId={doc.id} onClose={() => setCommentsOpen(false)} />
      )}
    </div>
  );
}

/* ---------- route component ---------- */

export default function DocumentView(): React.ReactElement {
  const api = useElectronAPI();
  const { documentId } = useParams<{ documentId: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const openTab = useTabsStore((s) => s.openTab);
  const updateTab = useTabsStore((s) => s.updateTab);
  const [reloadKey, setReloadKey] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "document", documentId],
    queryFn: () =>
      unwrapIpc<DocumentInfoResponse>(
        api.documents.info(activeProfileId!, documentId!),
      ),
    enabled: !!activeProfileId && !!documentId,
  });

  // Register/refresh a tab for this document
  useEffect(() => {
    if (!documentId) return;
    openTab({ documentId, title: "加载中…" });
  }, [documentId, openTab]);

  useEffect(() => {
    if (documentId && data?.data) {
      updateTab(documentId, {
        title: data.data.title || "Untitled",
        emoji: data.data.emoji,
      });
    }
  }, [documentId, data, updateTab]);

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
