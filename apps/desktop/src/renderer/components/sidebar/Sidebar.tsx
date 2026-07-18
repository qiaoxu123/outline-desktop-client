import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../outlineIcons";
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
import { sortDocsByTitle } from "../../lib/naturalSort";
import {
  discussCollectionId,
  useDiscussNewTopicCount,
} from "../../features/discuss/useDiscuss";
import DocActions, { type DocActionsHandle } from "./DocActions";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
} from "@outline/shared-types";
import "./Sidebar.css";

/** Natural title sort applied to every level of a collection tree. */
function sortTreeByTitle(
  nodes: OutlineCollectionDocument[],
  direction: "asc" | "desc",
): OutlineCollectionDocument[] {
  return sortDocsByTitle(nodes, direction).map((n) =>
    n.children?.length
      ? { ...n, children: sortTreeByTitle(n.children, direction) }
      : n,
  );
}

/** Persisted Set<string> helper for sidebar expand state. */
function loadIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

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
    <OIcon
      name="collection"
      size={16}
      color={color || "var(--color-primary)"}
      style={{ flexShrink: 0 }}
    />
  );
}

function Chevron({ open }: { open: boolean }): React.ReactElement {
  // Outline web's disclosure chevron (CollapsedIcon points down = open).
  return (
    <OIcon
      name="collapsed"
      size={16}
      style={{
        transform: open ? "none" : "rotate(-90deg)",
        transition: "transform 0.12s",
        flexShrink: 0,
      }}
    />
  );
}

/* ---------- recursive document node ---------- */

function DocNode({
  doc,
  expanded,
  toggle,
  collectionId,
}: {
  doc: OutlineCollectionDocument;
  expanded: Set<string>;
  toggle: (id: string) => void;
  collectionId?: string;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const hasChildren = doc.children && doc.children.length > 0;
  const isOpen = expanded.has(doc.id);
  const actionsRef = useRef<DocActionsHandle>(null);

  return (
    <div className="sb-node">
      <div
        className={`sb-item ${selectedDocumentId === doc.id ? "active" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          actionsRef.current?.openMenu(e.clientX, e.clientY);
        }}
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
        <DocActions
          ref={actionsRef}
          docId={doc.id}
          title={doc.title || "Untitled"}
          collectionId={collectionId}
        />
      </div>
      {hasChildren && isOpen && (
        <div className="sb-children">
          {doc.children.map((child) => (
            <DocNode
              key={child.id}
              doc={child}
              expanded={expanded}
              toggle={toggle}
              collectionId={collectionId}
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
  sort,
}: {
  collectionId: string;
  sort?: { field: string; direction: "asc" | "desc" };
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

  let documents = data?.data ?? [];
  if (documents.length === 0) return <div className="sb-note">（空）</div>;
  // Natural numeric title order for title-sorted collections (the server's
  // title sort is lexicographic: 1, 10, 2 …); manual index order untouched.
  if (sort?.field === "title") {
    documents = sortTreeByTitle(documents, sort.direction);
  }

  return (
    <div className="sb-tree sb-children">
      {documents.map((doc) => (
        <DocNode
          key={doc.id}
          doc={doc}
          expanded={expanded}
          toggle={toggle}
          collectionId={collectionId}
        />
      ))}
    </div>
  );
}

/** Hover “+” on a collection row — create a document at the collection root. */
function CollectionAddDoc({
  collectionId,
}: {
  collectionId: string;
}): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const create = useMutation({
    mutationFn: async () => {
      const res = await unwrapIpc<{ data: { id: string } }>(
        api.call(activeProfileId!, "documents.create", {
          title: "新文档",
          text: "",
          collectionId,
          publish: true,
        }),
      );
      return res.data.id;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
      navigate(`/document/${id}`);
    },
  });

  return (
    <span className="sb-actions">
      <button
        className="sb-action-btn"
        title="在此集合新建文档"
        disabled={create.isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          create.mutate();
        }}
      >
        +
      </button>
    </span>
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
      {sortDocsByTitle(children).map((child) => (
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
  const actionsRef = useRef<DocActionsHandle>(null);

  return (
    <div className="sb-node">
      <div
        className={`sb-item ${selectedDocumentId === doc.id ? "active" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          actionsRef.current?.openMenu(e.clientX, e.clientY);
        }}
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
        <DocActions
          ref={actionsRef}
          docId={doc.id}
          title={doc.title || "Untitled"}
        />
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
            <OIcon name="starred" size={14} color="var(--color-star)" style={{ flexShrink: 0 }} />
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
  // Let users skip the "point me at your folder" prompt and self-select later.
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("ui.personalNotesSkip") === "1",
  );
  const skip = () => {
    localStorage.setItem("ui.personalNotesSkip", "1");
    setDismissed(true);
  };
  const unskip = () => {
    localStorage.removeItem("ui.personalNotesSkip");
    setDismissed(false);
  };

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

      {!root && !dismissed && (
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
          <button className="sb-personal-skip" onClick={skip}>
            暂时跳过，稍后再选
          </button>
          {notice && <p className="sb-note error">{notice}</p>}
        </div>
      )}

      {!root && dismissed && (
        <button className="sb-personal-skip-link" onClick={unskip}>
          设置个人笔记…
        </button>
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
              <OIcon name="collection" size={16} color="var(--color-star)" style={{ flexShrink: 0 }} />
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
  const discussNew = useDiscussNewTopicCount();
  // Expand state survives restarts (previously component state, reset on
  // every remount/navigation).
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    () => loadIdSet("ui.expandedCollections"),
  );
  const [starsOpen, setStarsOpen] = useState(true);
  const [collectionsOpen, setCollectionsOpen] = useState(
    localStorage.getItem("ui.collectionsOpen") !== "0",
  );

  const toggleCollectionsSection = () => {
    setCollectionsOpen((open) => {
      localStorage.setItem("ui.collectionsOpen", open ? "0" : "1");
      return !open;
    });
  };

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet("ui.expandedCollections", next);
      return next;
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      unwrapIpc<CollectionListResponse>(api.collections.list(activeProfileId!)),
    enabled: !!activeProfileId,
  });

  // 讨论区 has its own dedicated nav entry — showing the raw collection here
  // too would create a confusing second click-path into the same content.
  const collections = (data?.data ?? []).filter(
    (c) => c.id !== discussCollectionId(),
  );
  const avatar = absoluteUrl(user?.avatarUrl);

  const navItem = (
    path: string,
    label: string,
    icon: React.ReactElement,
    iconOnly = false,
    badge = 0,
  ): React.ReactElement => (
    <a
      href={`#${path}`}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={`sb-nav-item ${iconOnly ? "icon-only" : ""} ${location.pathname === path ? "active" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(path);
      }}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
      {badge > 0 && (
        <span className="sb-badge" title={`${badge} 条新动态`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
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

      <nav className="sb-quick-nav">
        {navItem("/search", "搜索", <OIcon name="search" size={18} />, true)}
        {navItem("/", "主页", <OIcon name="home" size={18} />, true)}
        {navItem(
          "/settings",
          "设置",
          <OIcon name="settings" size={18} />,
          true,
        )}
        <span className="sb-nav-divider" aria-hidden="true">｜</span>
        {navItem(
          "/discuss",
          "讨论区",
          <OIcon name="comment" size={18} />,
          true,
          discussNew,
        )}
        {navItem("/papers", "论文库", <OIcon name="academicCap" size={18} />, true)}
        {navItem("/quiz", "自测题库", <OIcon name="checkbox" size={18} />, true)}
        {navItem("/shares", "共享链接", <OIcon name="globe" size={18} />, true)}
      </nav>

      <div className="sb-scroll">

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
        <button
          className="sb-section-header"
          onClick={toggleCollectionsSection}
          title={collectionsOpen ? "收起集合" : "展开集合"}
        >
          <span>集合</span>
          <Chevron open={collectionsOpen} />
        </button>
        {collectionsOpen && isLoading && (
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
        {collectionsOpen && !!error && (
          <div className="sb-note error">集合加载失败</div>
        )}
        {collectionsOpen && !isLoading && !error && (
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
                    <CollectionAddDoc collectionId={col.id} />
                  </div>
                  {isOpen && (
                    <CollectionTree collectionId={col.id} sort={col.sort} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      <div className="sb-footer">
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
        <a
          href="#/papers/graph"
          className={`sb-footer-graph ${location.pathname === "/papers/graph" ? "active" : ""}`}
          title="关系图"
          aria-label="关系图"
          onClick={(e) => {
            e.preventDefault();
            navigate("/papers/graph");
          }}
        >
          <OIcon name="graph" size={18} />
        </a>
      </div>
    </div>
  );
}
