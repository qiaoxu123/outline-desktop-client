import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import {
  useUserInfo,
  useStars,
  absoluteUrl,
} from "../../hooks/useOutline";
import {
  usePersonalRoot,
  useSetPersonalRoot,
  useAutoDetectRoot,
  useCreatePersonalNote,
  type PersonalRoot,
} from "../../hooks/usePersonalNotes";
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

/**
 * Collections can have an emoji icon, a named icon, or none. Render emoji
 * directly; otherwise show a folder glyph tinted with the collection color
 * (the bare color dot looked broken).
 */
function CollectionIcon({
  icon,
  color,
}: {
  icon: string | null;
  color: string | null;
}): React.ReactElement {
  if (icon && /\p{Extended_Pictographic}/u.test(icon)) {
    return <span className="sb-emoji">{icon}</span>;
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={color || "var(--color-primary)"}
      style={{ flexShrink: 0 }}
    >
      <path d="M3 6a2 2 0 012-2h4.172a2 2 0 011.414.586L12 6h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
    </svg>
  );
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

/* ---------- recursive document node ---------- */

function DocNode({
  doc,
  expanded,
  toggle,
}: {
  doc: OutlineCollectionDocument;
  expanded: Set<string>;
  toggle: (id: string) => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const hasChildren = doc.children && doc.children.length > 0;
  const isOpen = expanded.has(doc.id);

  return (
    <div className="sb-node">
      <div
        className={`sb-item ${selectedDocumentId === doc.id ? "active" : ""}`}
      >
        <button
          className={`sb-chevron ${hasChildren ? "" : "hidden"}`}
          onClick={() => hasChildren && toggle(doc.id)}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            <Chevron open={isOpen} />
          ) : (
            <span className="sb-doc-dot" />
          )}
        </button>
        <a
          href={`#/document/${doc.id}`}
          className="sb-link"
          onClick={(e) => {
            e.preventDefault();
            selectDocument(doc.id);
            navigate(`/document/${doc.id}`);
          }}
          title={doc.title || "Untitled"}
        >
          {doc.emoji && <span className="sb-emoji">{doc.emoji}</span>}
          <span className="sb-title">{doc.title || "Untitled"}</span>
        </a>
      </div>
      {hasChildren && isOpen && (
        <div className="sb-children">
          {doc.children.map((child) => (
            <DocNode
              key={child.id}
              doc={child}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- lazy tree for one collection ---------- */

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

  if (isLoading) return <div className="sb-note">加载中…</div>;
  if (error) return <div className="sb-note">加载失败</div>;

  const documents = data?.data ?? [];
  if (documents.length === 0) return <div className="sb-note">（空）</div>;

  return (
    <div className="sb-tree sb-children">
      {documents.map((doc) => (
        <DocNode key={doc.id} doc={doc} expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

/* ---------- starred items (expandable to child documents) ---------- */

interface ChildDoc {
  id: string;
  title: string;
  emoji?: string | null;
}

function ChildDocs({
  parentDocumentId,
}: {
  parentDocumentId: string;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading } = useQuery({
    queryKey: ["profile", activeProfileId, "children", parentDocumentId],
    queryFn: () =>
      unwrapIpc<{ data: ChildDoc[] }>(
        api.call(activeProfileId!, "documents.list", {
          parentDocumentId,
          limit: 100,
        }),
      ),
    enabled: !!activeProfileId,
  });

  if (isLoading) return <div className="sb-note">加载中…</div>;
  const children = data?.data ?? [];
  if (children.length === 0) return <div className="sb-note">（无子文档）</div>;

  return (
    <div className="sb-children">
      {children.map((child) => (
        <ChildNode key={child.id} doc={child} />
      ))}
    </div>
  );
}

function ChildNode({ doc }: { doc: ChildDoc }): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const [open, setOpen] = useState(false);

  return (
    <div className="sb-node">
      <div
        className={`sb-item ${selectedDocumentId === doc.id ? "active" : ""}`}
      >
        <button className="sb-chevron" onClick={() => setOpen(!open)}>
          <Chevron open={open} />
        </button>
        <a
          href={`#/document/${doc.id}`}
          className="sb-link"
          onClick={(e) => {
            e.preventDefault();
            selectDocument(doc.id);
            navigate(`/document/${doc.id}`);
          }}
          title={doc.title || "Untitled"}
        >
          {doc.emoji && <span className="sb-emoji">{doc.emoji}</span>}
          <span className="sb-title">{doc.title || "Untitled"}</span>
        </a>
      </div>
      {open && <ChildDocs parentDocumentId={doc.id} />}
    </div>
  );
}

function StarNode({
  documentId,
  title,
  emoji,
}: {
  documentId: string;
  title: string;
  emoji?: string | null;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const [open, setOpen] = useState(false);

  return (
    <div className="sb-node">
      <div
        className={`sb-item ${selectedDocumentId === documentId ? "active" : ""}`}
      >
        <button
          className="sb-chevron"
          onClick={() => setOpen(!open)}
          title={open ? "收起" : "展开子文档"}
        >
          <Chevron open={open} />
        </button>
        <a
          href={`#/document/${documentId}`}
          className="sb-link"
          onClick={(e) => {
            e.preventDefault();
            selectDocument(documentId);
            navigate(`/document/${documentId}`);
          }}
          title={title}
        >
          {emoji ? (
            <span className="sb-emoji">{emoji}</span>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--color-star)" style={{ flexShrink: 0 }}>
              <path d="M8 1.5l1.94 3.93 4.34.63-3.14 3.06.74 4.32L8 11.4l-3.88 2.04.74-4.32L1.72 6.06l4.34-.63L8 1.5z" />
            </svg>
          )}
          <span className="sb-title">{title}</span>
        </a>
      </div>
      {open && <ChildDocs parentDocumentId={documentId} />}
    </div>
  );
}

/* ---------- personal notes: a clean shortcut into the user's own folder ---------- */

/**
 * Modal that lets the user point "个人笔记" at any existing document on the
 * server (used when auto-detection can't find their folder). Browsing the
 * collection trees and clicking a node designates it as the personal root.
 */
function PersonalRootPicker({
  onPick,
  onClose,
}: {
  onPick: (root: PersonalRoot) => void;
  onClose: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [openCol, setOpenCol] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      unwrapIpc<CollectionListResponse>(api.collections.list(activeProfileId!)),
    enabled: !!activeProfileId,
  });
  const collections = data?.data ?? [];

  return (
    <div className="sb-modal-backdrop" onClick={onClose}>
      <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sb-modal-header">
          <span>选择个人笔记目录</span>
          <button className="history-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <p className="sb-modal-hint">
          点击你的个人目录（例如 成员笔记 / 博士 / 乔旭）。之后新建的笔记都会同步到这里。
        </p>
        <div className="sb-modal-body">
          {collections.map((col) => (
            <div key={col.id}>
              <button
                className="sb-modal-col"
                onClick={() => setOpenCol(openCol === col.id ? null : col.id)}
              >
                <Chevron open={openCol === col.id} />
                <CollectionIcon icon={col.icon} color={col.color} />
                <span className="sb-title">{col.name}</span>
              </button>
              {openCol === col.id && (
                <PickerTree
                  collectionId={col.id}
                  onPick={(docId) => onPick({ docId, collectionId: col.id })}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PickerTree({
  collectionId,
  onPick,
  depth = 0,
}: {
  collectionId: string;
  onPick: (docId: string) => void;
  depth?: number;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading } = useQuery({
    queryKey: ["profile", activeProfileId, "collection", collectionId, "documents"],
    queryFn: () =>
      unwrapIpc<CollectionDocumentsResponse>(
        api.collections.documents(activeProfileId!, collectionId),
      ),
    enabled: !!activeProfileId,
  });

  if (isLoading) return <div className="sb-note">加载中…</div>;
  const docs = data?.data ?? [];

  const renderNodes = (
    nodes: OutlineCollectionDocument[],
    level: number,
  ): React.ReactElement[] =>
    nodes.flatMap((doc) => [
      <button
        key={doc.id}
        className="sb-modal-doc"
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => onPick(doc.id)}
        title="设为个人笔记目录"
      >
        {doc.emoji ? (
          <span className="sb-emoji">{doc.emoji}</span>
        ) : (
          <span className="sb-doc-dot" />
        )}
        <span className="sb-title">{doc.title || "Untitled"}</span>
      </button>,
      ...(doc.children?.length ? renderNodes(doc.children, level + 1) : []),
    ]);

  if (docs.length === 0) return <div className="sb-note">（空）</div>;
  return <div className="sb-children">{renderNodes(docs, depth)}</div>;
}

function PersonalNotesSection(): React.ReactElement {
  const navigate = useNavigate();
  const { root, isLoading } = usePersonalRoot();
  const { setRoot } = useSetPersonalRoot();
  const autoDetect = useAutoDetectRoot();
  const { create, isPending: creating } = useCreatePersonalNote();
  const [open, setOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [notice, setNotice] = useState("");

  const handleSetup = async (): Promise<void> => {
    setDetecting(true);
    setNotice("");
    try {
      const hit = await autoDetect();
      if (hit) {
        await setRoot(hit);
      } else {
        setNotice("未自动找到，请手动选择");
        setPickerOpen(true);
      }
    } catch {
      setPickerOpen(true);
    } finally {
      setDetecting(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (!root) return;
    const id = await create(root);
    navigate(`/document/${id}`);
  };

  return (
    <div className="sb-section">
      <div className="sb-section-header static">
        <span>个人笔记</span>
        {root && (
          <button
            className="sb-add-btn"
            onClick={handleCreate}
            disabled={creating}
            title="新建笔记"
          >
            {creating ? "…" : "+"}
          </button>
        )}
      </div>

      {!root && (
        <div className="sb-personal-setup">
          <p className="sb-note">把这里指向你在服务器上的个人目录。</p>
          <button
            className="sb-personal-btn"
            onClick={handleSetup}
            disabled={detecting || isLoading}
          >
            {detecting ? "定位中…" : "自动定位我的目录"}
          </button>
          <button
            className="sb-personal-btn subtle"
            onClick={() => setPickerOpen(true)}
          >
            手动选择…
          </button>
          {notice && <p className="sb-note error">{notice}</p>}
        </div>
      )}

      {root && (
        <div>
          <div className="sb-item">
            <button className="sb-chevron" onClick={() => setOpen(!open)}>
              <Chevron open={open} />
            </button>
            <a
              href={`#/document/${root.docId}`}
              className="sb-link"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/document/${root.docId}`);
              }}
              title="打开个人笔记目录"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-star)" style={{ flexShrink: 0 }}>
                <path d="M3 6a2 2 0 012-2h4.172a2 2 0 011.414.586L12 6h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
              </svg>
              <span className="sb-title">我的笔记</span>
            </a>
          </div>
          {open && <ChildDocs parentDocumentId={root.docId} />}
        </div>
      )}

      {pickerOpen && (
        <PersonalRootPicker
          onPick={async (r) => {
            await setRoot(r);
            setPickerOpen(false);
            setNotice("");
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------- sidebar ---------- */

export default function Sidebar(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const location = useLocation();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectedCollectionId = useUIStore((s) => s.selectedCollectionId);
  const selectCollection = useUIStore((s) => s.selectCollection);
  const { user, team } = useUserInfo();
  const { starred } = useStars();
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(),
  );
  const [starsOpen, setStarsOpen] = useState(true);

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
  const avatar = absoluteUrl(user?.avatarUrl);

  const navItem = (
    path: string,
    label: string,
    icon: React.ReactElement,
  ): React.ReactElement => (
    <a
      href={`#${path}`}
      className={`sb-nav-item ${location.pathname === path ? "active" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(path);
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );

  return (
    <div className="sidebar">
      <div className="sb-team">
        <div className="sb-team-avatar">
          {(team?.name || "O").slice(0, 1).toUpperCase()}
        </div>
        <span className="sb-team-name">{team?.name ?? "Outline"}</span>
      </div>

      <nav className="sb-nav">
        {navItem(
          "/search",
          "搜索",
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.975 1.975 0 00-.017.016zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>,
        )}
        {navItem(
          "/",
          "主页",
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5L1.5 7v7a1 1 0 001 1H6v-4.5h4V15h3.5a1 1 0 001-1V7L8 1.5z" />
          </svg>,
        )}
        {navItem(
          "/shares",
          "共享链接",
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.5 4.5a2.5 2.5 0 10-2.45-2H11a4.5 4.5 0 00-4.39 3.55 2.5 2.5 0 100 4.9A4.5 4.5 0 0011 14h.05a2.5 2.5 0 102.45-3 2.49 2.49 0 00-1.8.77A3.49 3.49 0 0111 12.5h-.05a2.5 2.5 0 000-4.99H11c.27 0 .53.03.78.09.43.49 1.05.8 1.72.8z" opacity="0" />
            <path d="M11 2a3 3 0 100 6c.35 0 .69-.06 1-.17v.34A3 3 0 1011 14a3 3 0 002.83-4H14a3 3 0 00-3-8zm-6 4a3 3 0 100 6 3 3 0 000-6z" opacity="0" />
            <path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1 1 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4 4 0 01-.128-1.287z" />
            <path d="M6.586 4.672A3 3 0 007.414 9.5l.775-.776a2 2 0 01-.896-3.346L9.12 3.55a2 2 0 113.03 2.61l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 10-4.243-4.243L6.586 4.672z" />
          </svg>,
        )}
        {navItem(
          "/settings",
          "设置",
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4zM14.3 8.7l-1.18-.68a5.09 5.09 0 000-1.04l1.18-.68a.3.3 0 00.11-.41l-1-1.73a.3.3 0 00-.41-.11l-1.18.68a5.09 5.09 0 00-.9-.52l-.18-1.37a.3.3 0 00-.3-.24H8.56a.3.3 0 00-.3.24l-.18 1.37c-.32.14-.62.32-.9.52l-1.18-.68a.3.3 0 00-.41.11l-1 1.73a.3.3 0 00.11.41l1.18.68a5.09 5.09 0 000 1.04l-1.18.68a.3.3 0 00-.11.41l1 1.73a.3.3 0 00.41.11l1.18-.68c.28.2.58.38.9.52l.18 1.37a.3.3 0 00.3.24h1.88a.3.3 0 00.3-.24l.18-1.37c.32-.14.62-.32.9-.52l1.18.68a.3.3 0 00.41-.11l1-1.73a.3.3 0 00-.11-.41z" />
          </svg>,
        )}
      </nav>

      {starred.length > 0 && (
        <div className="sb-section">
          <button className="sb-section-header" onClick={() => setStarsOpen(!starsOpen)}>
            <span>星标</span>
            <Chevron open={starsOpen} />
          </button>
          {starsOpen && (
            <div className="sb-tree">
              {starred.map((s) => (
                <StarNode key={s.starId} documentId={s.documentId} title={s.title} emoji={s.emoji} />
              ))}
            </div>
          )}
        </div>
      )}

      <PersonalNotesSection />

      <div className="sb-section sb-section-grow">
        <div className="sb-section-header static">
          <span>集合</span>
        </div>
        {isLoading && (
          <div className="sb-loading">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="sb-skeleton"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        )}
        {!!error && <div className="sb-note error">集合加载失败</div>}
        {!isLoading && !error && (
          <div>
            {collections.map((col) => {
              const isOpen = expandedCollections.has(col.id);
              return (
                <div key={col.id}>
                  <div
                    className={`sb-item ${selectedCollectionId === col.id ? "active" : ""}`}
                  >
                    <button
                      className="sb-chevron"
                      onClick={() => toggleCollection(col.id)}
                      title={isOpen ? "收起" : "展开"}
                    >
                      <Chevron open={isOpen} />
                    </button>
                    <a
                      href={`#/collection/${col.id}`}
                      className="sb-link"
                      onClick={(e) => {
                        e.preventDefault();
                        selectCollection(col.id);
                        if (!isOpen) toggleCollection(col.id);
                        navigate(`/collection/${col.id}`);
                      }}
                    >
                      <CollectionIcon icon={col.icon} color={col.color} />
                      <span className="sb-title">{col.name}</span>
                    </a>
                  </div>
                  {isOpen && <CollectionTree collectionId={col.id} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <a
        href="#/settings"
        className="sb-account"
        onClick={(e) => {
          e.preventDefault();
          navigate("/settings");
        }}
      >
        {avatar ? (
          <img className="sb-account-avatar" src={avatar} alt={user?.name} />
        ) : (
          <div className="sb-account-avatar sb-account-avatar-fallback">
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="sb-account-info">
          <div className="sb-account-name">{user?.name ?? "…"}</div>
          {user?.email && <div className="sb-account-email">{user.email}</div>}
        </div>
      </a>
    </div>
  );
}
