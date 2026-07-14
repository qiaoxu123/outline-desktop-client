import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
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
import { sortDocsByTitle } from "../../lib/naturalSort";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import {
  useMarkdownEditor,
  getMarkdown,
  MarkdownEditorContent,
} from "./Editor";
import { commentHighlightsKey } from "./extensions/commentHighlights";
import { OIcon } from "../../components/outlineIcons";
import { discussCollectionId } from "../discuss/useDiscuss";
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

  const nav = (
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

  // dock into the AppShell slot at the far right (outside the content
  // scroller) so the TOC scrolls independently and never covers the article
  const slot = document.getElementById("toc-slot");
  return slot ? createPortal(nav, slot) : nav;
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
  count?: number;
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

  const totalViews = viewers.reduce((sum, v) => sum + (v.count ?? 1), 0);

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
      <span
        className="viewer-count"
        title={`${sorted.length} 人浏览过，共 ${totalViews} 次`}
      >
        {totalViews} 次浏览
      </span>
    </div>
  );
}

/* ---------- comments (threaded, aligned with Outline web) ---------- */

interface Comment {
  id: string;
  data?: { content?: unknown };
  text?: string;
  createdAt: string;
  parentCommentId?: string | null;
  /** Anchored comments carry the text they were attached to (web-created). */
  anchorText?: string | null;
  resolvedAt?: string | null;
  createdBy?: { id: string; name: string; avatarUrl?: string | null };
}

/** Shared comments query — panel, count badge and anchor decorations all
 * read the same cache entry. */
function useComments(documentId: string): {
  comments: Comment[];
  isLoading: boolean;
  error: unknown;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "comments", documentId],
    queryFn: () =>
      unwrapIpc<{ data: Comment[] }>(
        api.call(activeProfileId!, "comments.list", {
          documentId,
          includeAnchorText: true,
        }),
      ),
    enabled: !!activeProfileId,
  });
  return { comments: data?.data ?? [], isLoading, error };
}

function commentText(c: Comment): string {
  // Outline stores comment bodies as a ProseMirror doc in `c.data`
  // ({ type:"doc", content:[…] }); fall back to any plain text field.
  if (c.text && c.text.trim()) return c.text;
  const data = c.data as unknown;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    try {
      return extractProseText(data).trim();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Text to highlight in the document for a comment.
 * Web-anchored comments carry a server `anchorText`. Desktop comments can't
 * persist an anchor mark through the markdown save path, so they quote the
 * selection into the body as a 「…」 line — we recover that as the anchor so
 * the commented spot still gets a highlight (best-effort; first exact match).
 */
function deriveAnchorText(c: Comment): string | null {
  if (c.anchorText && c.anchorText.trim()) return c.anchorText.trim();
  const m = /「([^」]+)」/.exec(commentText(c));
  return m ? m[1].trim() : null;
}

function extractProseText(node: unknown): string {
  // Accept either a node ({ type, text?, content? }) or a raw content array,
  // so passing the whole doc node walks its children correctly.
  if (Array.isArray(node)) return node.map(extractProseText).join("");
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown };
  if (typeof n.text === "string") return n.text;
  const inner = Array.isArray(n.content)
    ? n.content.map(extractProseText).join("")
    : "";
  // Separate block-level nodes with a newline so multi-line comments read.
  return n.type === "paragraph" || n.type === "heading" ? `${inner}\n` : inner;
}

function CommentItem({
  comment,
  ownUserId,
  onDelete,
  deleting,
}: {
  comment: Comment;
  ownUserId?: string;
  onDelete: (id: string) => void;
  deleting: boolean;
}): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = absoluteUrl(comment.createdBy?.avatarUrl);
  const own = !!ownUserId && comment.createdBy?.id === ownUserId;

  return (
    <div className="comment-item">
      <div className="comment-avatar">
        {url ? (
          <img src={url} alt={comment.createdBy?.name} />
        ) : (
          <span className="comment-avatar-fallback">
            {(comment.createdBy?.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="comment-body">
        <div className="comment-meta">
          <span className="comment-author">{comment.createdBy?.name}</span>
          <span className="comment-time">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
          {own && (
            <button
              className={`comment-op ${confirmDelete ? "danger" : ""}`}
              disabled={deleting}
              onClick={() =>
                confirmDelete ? onDelete(comment.id) : setConfirmDelete(true)
              }
            >
              {confirmDelete ? "确认删除？" : "删除"}
            </button>
          )}
        </div>
        <div className="comment-text">{commentText(comment)}</div>
      </div>
    </div>
  );
}

function CommentsPanel({
  documentId,
  onClose,
  focusedCommentId,
  quote,
  onQuoteChange,
  inline = false,
}: {
  documentId: string;
  onClose: () => void;
  focusedCommentId?: string | null;
  /** Selected text from the editor's 评论 button, quoted into a new comment. */
  quote?: string;
  onQuoteChange?: (quote: string) => void;
  /** Forum layout: full-width reply stream under the article body instead of
   * the side panel (no header/close). */
  inline?: boolean;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const { comments, isLoading, error } = useComments(documentId);

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["profile", activeProfileId, "comments", documentId],
    });

  const createMutation = useMutation({
    mutationFn: ({
      text,
      quoted,
      parentCommentId,
    }: {
      text: string;
      quoted?: string;
      parentCommentId?: string;
    }) => {
      // Outline stores comment bodies as ProseMirror doc data. New comments
      // from the desktop are unanchored (an anchor mark can't survive our
      // markdown save path) — the selected text rides along as an italic
      // 「…」 line. (Outline's comment schema rejects blockquote nodes with
      // "data: Invalid data", so we can't quote with a real blockquote.)
      const content: unknown[] = [];
      if (quoted?.trim()) {
        content.push({
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "em" }],
              text: `「${quoted.trim()}」`,
            },
          ],
        });
      }
      content.push({
        type: "paragraph",
        content: [{ type: "text", text }],
      });
      return unwrapIpc(
        api.call(activeProfileId!, "comments.create", {
          documentId,
          ...(parentCommentId ? { parentCommentId } : {}),
          data: { type: "doc", content },
        }),
      );
    },
    onSuccess: (_data, vars) => {
      if (vars.parentCommentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
        onQuoteChange?.("");
      }
      invalidate();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      unwrapIpc(
        api.call(
          activeProfileId!,
          resolved ? "comments.unresolve" : "comments.resolve",
          { id },
        ),
      ),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      unwrapIpc(api.call(activeProfileId!, "comments.delete", { id })),
    onSuccess: invalidate,
  });

  // Scroll the focused thread (clicked anchor in the document) into view.
  useEffect(() => {
    if (!focusedCommentId) return;
    const el = listRef.current?.querySelector(
      `[data-thread-id="${focusedCommentId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedCommentId, comments.length]);

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesFor = (id: string) =>
    comments.filter((c) => c.parentCommentId === id);
  const mutationFailed =
    createMutation.isError || resolveMutation.isError || deleteMutation.isError;

  return (
    <div className={`comments-panel ${inline ? "comments-inline" : ""}`}>
      {inline ? (
        <div className="comments-inline-title">
          {comments.length > 0 ? `${comments.length} 条回复` : "回复"}
        </div>
      ) : (
        <div className="comments-header">
          <span>评论{comments.length > 0 ? ` (${comments.length})` : ""}</span>
          <button className="history-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
      )}

      {isLoading && <p className="history-note">加载中…</p>}
      {!!error && <p className="history-note error">无法加载评论</p>}
      {mutationFailed && (
        <p className="history-note error">操作失败，请稍后重试</p>
      )}
      {!isLoading && comments.length === 0 && (
        <p className="history-note">还没有评论，来写第一条吧。</p>
      )}

      <div className="comments-list" ref={listRef}>
        {topLevel.map((c) => {
          const replies = repliesFor(c.id);
          const resolved = !!c.resolvedAt;
          return (
            <div
              key={c.id}
              data-thread-id={c.id}
              className={`comment-thread ${resolved ? "resolved" : ""} ${
                focusedCommentId === c.id ? "focused" : ""
              }`}
            >
              {c.anchorText && (
                <div className="comment-anchor-quote" title="评论锚定的原文">
                  {c.anchorText}
                </div>
              )}
              <CommentItem
                comment={c}
                ownUserId={user?.id}
                onDelete={(id) => deleteMutation.mutate(id)}
                deleting={deleteMutation.isPending}
              />
              {replies.map((r) => (
                <div key={r.id} className="comment-reply">
                  <CommentItem
                    comment={r}
                    ownUserId={user?.id}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    deleting={deleteMutation.isPending}
                  />
                </div>
              ))}
              <div className="comment-thread-ops">
                <button
                  className="comment-op"
                  onClick={() => {
                    setReplyTo(replyTo === c.id ? null : c.id);
                    setReplyDraft("");
                  }}
                >
                  回复
                </button>
                <button
                  className="comment-op"
                  disabled={resolveMutation.isPending}
                  onClick={() =>
                    resolveMutation.mutate({ id: c.id, resolved })
                  }
                >
                  {resolved ? "取消解决" : "解决"}
                </button>
                {resolved && <span className="comment-resolved-badge">已解决</span>}
              </div>
              {replyTo === c.id && (
                <div className="comment-reply-composer">
                  <textarea
                    className="comments-input"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="回复…"
                    rows={2}
                    autoFocus
                  />
                  <button
                    className="document-button primary"
                    disabled={createMutation.isPending || !replyDraft.trim()}
                    onClick={() =>
                      createMutation.mutate({
                        text: replyDraft.trim(),
                        parentCommentId: c.id,
                      })
                    }
                  >
                    {createMutation.isPending ? "发送中…" : "回复"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="comments-composer">
        {quote?.trim() && (
          <div className="comment-quote-chip">
            <span className="comment-quote-text">{quote}</span>
            <button
              className="history-close"
              title="移除引用"
              onClick={() => onQuoteChange?.("")}
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          className="comments-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="写下评论…"
          rows={3}
        />
        <button
          className="document-button primary"
          onClick={() =>
            draft.trim() &&
            createMutation.mutate({ text: draft.trim(), quoted: quote })
          }
          disabled={createMutation.isPending || !draft.trim()}
        >
          {createMutation.isPending ? "发送中…" : "发表评论"}
        </button>
      </div>
    </div>
  );
}

/* ---------- nested child documents (shown at the bottom, like web) ---------- */

interface NestedDoc {
  id: string;
  title: string;
  emoji?: string | null;
  updatedAt?: string;
}

function NestedDocuments({
  documentId,
}: {
  documentId: string;
}): React.ReactElement | null {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectDocument = useUIStore((s) => s.selectDocument);

  const { data } = useQuery({
    queryKey: ["profile", activeProfileId, "children", documentId],
    queryFn: () =>
      unwrapIpc<{ data: NestedDoc[] }>(
        api.call(activeProfileId!, "documents.list", {
          parentDocumentId: documentId,
          limit: 100,
        }),
      ),
    enabled: !!activeProfileId,
  });

  const children = data?.data ?? [];
  if (children.length === 0) return null;

  return (
    <section className="nested-docs">
      <div className="nested-docs-title">文档</div>
      <div className="nested-docs-list">
        {sortDocsByTitle(children).map((child) => (
          <a
            key={child.id}
            href={`#/document/${child.id}`}
            className="nested-doc-item"
            onClick={(e) => {
              e.preventDefault();
              selectDocument(child.id);
              navigate(`/document/${child.id}`);
            }}
          >
            <span className="nested-doc-icon">
              {child.emoji ?? (
                <OIcon name="document" size={18} style={{ opacity: 0.6 }} />
              )}
            </span>
            <span className="nested-doc-title">{child.title || "Untitled"}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Document actions live in the breadcrumb bar's right corner (top-right of
 * the content area) — portaled so each view keeps its own state/handlers. */
function TopRightActions({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const slot = document.getElementById("doc-actions-slot");
  if (!slot) return null;
  return createPortal(children, slot);
}

function CommentIcon(): React.ReactElement {
  return <OIcon name="comment" size={18} />;
}

function HistoryIcon(): React.ReactElement {
  return <OIcon name="history" size={18} />;
}

/* ---------- always-on editor (editors): open == editable, autosaves ---------- */

function EditableDocument({
  doc,
  onRestored,
}: {
  doc: OutlineDocument;
  onRestored: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const showToc = useUIStore((s) => s.showToc);
  const queryClient = useQueryClient();
  const updateTab = useTabsStore((s) => s.updateTab);
  const { starFor } = useStars();
  const { toggle: toggleStar, isPending: starPending } = useToggleStar();
  const star = starFor(doc.id);
  // Forum topics (讨论区 collection) show replies as a full-width stream
  // under the article body instead of the side panel.
  const isDiscussTopic =
    !!doc.collectionId && doc.collectionId === discussCollectionId();
  const inlineCommentsRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<"none" | "history" | "comments">("none");
  const { comments } = useComments(doc.id);
  const commentCount = comments.length;
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [commentQuote, setCommentQuote] = useState("");

  const [title, setTitle] = useState(doc.title);
  // TOC + read-pipeline preview track the live markdown as you type.
  const [tocSource, setTocSource] = useState(doc.text);
  const [saveState, setSaveState] =
    useState<"idle" | "saving" | "saved" | "error">("idle");

  const scrollToInlineComments = useCallback(() => {
    inlineCommentsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // Clicking an anchored-comment highlight in the text opens its thread.
  const onCommentClick = useCallback(
    (id: string) => {
      setFocusedCommentId(id);
      if (isDiscussTopic) scrollToInlineComments();
      else setPanel("comments");
    },
    [isDiscussTopic, scrollToInlineComments],
  );

  const editor = useMarkdownEditor(doc.text, true, onCommentClick);

  // Dev-only handle for round-trip debugging (compare
  // __editor.storage.markdown.getMarkdown() against __docText in devtools).
  useEffect(() => {
    if (!import.meta.env.DEV || !editor) return;
    const w = window as unknown as { __editor?: unknown; __docText?: string };
    w.__editor = editor;
    w.__docText = doc.text;
  }, [editor, doc.text]);

  // Push anchored comments into the editor's decoration plugin (meta-only
  // transaction — no doc change, so it never triggers the autosave handler).
  // Serialized so the effect only fires on real changes: dispatch re-renders
  // the component, and depending on the array identity would loop forever.
  const anchorsJson = useMemo(
    () =>
      JSON.stringify(
        comments
          .filter((c) => !c.parentCommentId)
          .map((c) => ({ id: c.id, anchorText: deriveAnchorText(c) }))
          .filter((a) => a.anchorText),
      ),
    [comments],
  );
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(commentHighlightsKey, JSON.parse(anchorsJson)),
    );
  }, [editor, anchorsJson]);

  // 评论 button in the selection toolbar: quote the selection into a new
  // (unanchored) comment — an anchor mark can't survive the markdown save.
  const onComment = useCallback(
    (selectedText: string) => {
      setCommentQuote(selectedText);
      setFocusedCommentId(null);
      if (isDiscussTopic) scrollToInlineComments();
      else setPanel("comments");
    },
    [isDiscussTopic, scrollToInlineComments],
  );

  // The pending payload is kept in a ref so the debounced/unmount save never
  // touches the (possibly torn-down) editor instance.
  const pendingRef = useRef({ title: doc.title, text: doc.text });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // last title the sidebar/tabs have been synced to; a save only refreshes
  // those caches when the title actually changed (text edits don't)
  const syncedTitleRef = useRef(doc.title);

  const doSave = useCallback(async () => {
    setSaveState("saving");
    const savingTitle = pendingRef.current.title;
    try {
      await unwrapIpc(
        api.documents.update(activeProfileId!, {
          id: doc.id,
          title: savingTitle,
          text: pendingRef.current.text,
        }),
      );
      setSaveState("saved");
      // The sidebar tree and tabs cache titles independently of the editor;
      // refresh them so a renamed doc updates everywhere without a reload.
      if (savingTitle !== syncedTitleRef.current) {
        syncedTitleRef.current = savingTitle;
        updateTab(doc.id, { title: savingTitle || "Untitled" });
        void queryClient.invalidateQueries({
          queryKey: [
            "profile",
            activeProfileId,
            "collection",
            doc.collectionId,
            "documents",
          ],
        });
        if (doc.parentDocumentId) {
          void queryClient.invalidateQueries({
            queryKey: [
              "profile",
              activeProfileId,
              "children",
              doc.parentDocumentId,
            ],
          });
        }
      }
    } catch {
      setSaveState("error");
    }
  }, [
    api,
    activeProfileId,
    doc.id,
    doc.collectionId,
    doc.parentDocumentId,
    queryClient,
    updateTab,
  ]);

  const scheduleSave = useCallback(() => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 1200);
  }, [doSave]);

  // Autosave on every edit; also refresh the TOC source.
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      // Only persist genuine user edits: extensions normalize content on load
      // (which fires "update" without focus) — saving then would rewrite every
      // opened document through the markdown round-trip unnecessarily.
      if (!editor.isFocused) return;
      pendingRef.current.text = getMarkdown(editor);
      setTocSource(pendingRef.current.text);
      scheduleSave();
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, scheduleSave]);

  // Flush any pending save when leaving the document.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void doSave();
      }
    };
  }, [doSave]);

  // Cmd/Ctrl+S forces an immediate save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        void doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  const saveLabel =
    saveState === "saving"
      ? "保存中…"
      : saveState === "saved"
        ? "已保存"
        : saveState === "error"
          ? "保存失败"
          : "";

  return (
    <div className={`document-layout ${isDiscussTopic ? "discuss-topic" : ""}`}>
      <TopRightActions>
        <div className="document-actions">
          {saveLabel && (
            <span
              className={`document-save-state ${saveState === "error" ? "error" : ""}`}
            >
              {saveLabel}
            </span>
          )}
          <Viewers documentId={doc.id} />
          <button
            className={`document-icon-button ${star ? "starred" : ""}`}
            onClick={() => toggleStar(doc.id, star)}
            disabled={starPending}
            title={star ? "取消星标" : "加星标"}
          >
            <OIcon
              name={star ? "starred" : "unstarred"}
              size={18}
              color={star ? "var(--color-star)" : "currentColor"}
            />
          </button>
          <button
            className={`document-icon-button ${panel === "comments" ? "active" : ""}`}
            onClick={() => {
              if (isDiscussTopic) scrollToInlineComments();
              else setPanel(panel === "comments" ? "none" : "comments");
            }}
            title={`${isDiscussTopic ? "回复" : "评论"}${commentCount > 0 ? ` (${commentCount})` : ""}`}
          >
            <CommentIcon />
            {commentCount > 0 && (
              <span className="icon-button-count">{commentCount}</span>
            )}
          </button>
          <button
            className={`document-icon-button ${panel === "history" ? "active" : ""}`}
            onClick={() =>
              setPanel(panel === "history" ? "none" : "history")
            }
            title="历史版本"
          >
            <HistoryIcon />
          </button>
        </div>
      </TopRightActions>
      <article className="document-article">
        <header className="document-header">
          <div className="document-header-row">
            <textarea
              className="document-title-input"
              value={title}
              rows={1}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onChange={(e) => {
                setTitle(e.target.value.replace(/\n/g, " "));
                pendingRef.current.title = e.target.value.replace(/\n/g, " ");
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
                scheduleSave();
              }}
              placeholder="无标题"
            />
          </div>
        </header>

        <div className="document-body">
          <MarkdownEditorContent editor={editor} onComment={onComment} />
        </div>
        {isDiscussTopic && (
          <div ref={inlineCommentsRef}>
            <CommentsPanel
              inline
              documentId={doc.id}
              onClose={() => undefined}
              focusedCommentId={focusedCommentId}
              quote={commentQuote}
              onQuoteChange={setCommentQuote}
            />
          </div>
        )}
        <NestedDocuments documentId={doc.id} />
      </article>

      {showToc && panel === "none" && <Toc markdown={tocSource} />}
      {panel === "history" && (
        <HistoryPanel
          documentId={doc.id}
          onClose={() => setPanel("none")}
          onRestored={onRestored}
        />
      )}
      {panel === "comments" && (
        <CommentsPanel
          documentId={doc.id}
          onClose={() => {
            setPanel("none");
            setFocusedCommentId(null);
          }}
          focusedCommentId={focusedCommentId}
          quote={commentQuote}
          onQuoteChange={setCommentQuote}
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
  const commentCount = useComments(doc.id).comments.length;
  const isDiscussTopic =
    !!doc.collectionId && doc.collectionId === discussCollectionId();
  const inlineCommentsRef = useRef<HTMLDivElement>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div className={`document-layout ${isDiscussTopic ? "discuss-topic" : ""}`}>
      <TopRightActions>
        <div className="document-actions">
          <Viewers documentId={doc.id} />
          <button
            className={`document-icon-button ${star ? "starred" : ""}`}
            onClick={() => toggleStar(doc.id, star)}
            disabled={starPending}
            title={star ? "取消星标" : "加星标"}
          >
            <OIcon
              name={star ? "starred" : "unstarred"}
              size={18}
              color={star ? "var(--color-star)" : "currentColor"}
            />
          </button>
          <button
            className={`document-icon-button ${commentsOpen ? "active" : ""}`}
            onClick={() => {
              if (isDiscussTopic) {
                inlineCommentsRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              } else {
                setCommentsOpen(!commentsOpen);
              }
            }}
            title={`${isDiscussTopic ? "回复" : "评论"}${commentCount > 0 ? ` (${commentCount})` : ""}`}
          >
            <CommentIcon />
            {commentCount > 0 && (
              <span className="icon-button-count">{commentCount}</span>
            )}
          </button>
        </div>
      </TopRightActions>
      <article className="document-article">
        <header className="document-header">
          <div className="document-header-row">
            <h1 className="document-title">
              {doc.emoji && <span className="document-emoji">{doc.emoji}</span>}
              {doc.title || "Untitled"}
            </h1>
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
        {isDiscussTopic && (
          <div ref={inlineCommentsRef}>
            <CommentsPanel
              inline
              documentId={doc.id}
              onClose={() => undefined}
            />
          </div>
        )}
        <NestedDocuments documentId={doc.id} />
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

  // Record a view (like web) so 浏览次数 counts desktop reads too, then
  // refresh the viewers row.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!documentId || !activeProfileId) return;
    void (async () => {
      try {
        await api.call(activeProfileId, "views.create", { documentId });
        await queryClient.invalidateQueries({
          queryKey: ["profile", activeProfileId, "views", documentId],
        });
      } catch {
        /* view tracking is best-effort */
      }
    })();
  }, [documentId, activeProfileId, api, queryClient]);

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
