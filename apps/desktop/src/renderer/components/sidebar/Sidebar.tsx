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
  depth,
  expanded,
  toggle,
}: {
  doc: OutlineCollectionDocument;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const hasChildren = doc.children && doc.children.length > 0;
  const isOpen = expanded.has(doc.id);

  return (
    <div>
      <div
        className={`sb-item ${selectedDocumentId === doc.id ? "active" : ""}`}
        style={{ paddingLeft: `${22 + depth * 14}px` }}
      >
        <button
          className={`sb-chevron ${hasChildren ? "" : "hidden"}`}
          onClick={() => hasChildren && toggle(doc.id)}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            <Chevron open={isOpen} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
              <path d="M6 4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8.83a2 2 0 00-.59-1.42l-2.82-2.82A2 2 0 0015.17 4H6zm0 2h9v3a1 1 0 001 1h3v8H6V6z" opacity="0" />
              <path d="M7 3a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8.41a2 2 0 00-.59-1.41l-3.41-3.41A2 2 0 0013.59 3H7zm0 2h6v3a1 1 0 001 1h3v10H7V5z" />
            </svg>
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
        <div>
          {doc.children.map((child) => (
            <DocNode
              key={child.id}
              doc={child}
              depth={depth + 1}
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
    <div className="sb-tree">
      {documents.map((doc) => (
        <DocNode key={doc.id} doc={doc} depth={0} expanded={expanded} toggle={toggle} />
      ))}
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
  const selectDocument = useUIStore((s) => s.selectDocument);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
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
                <div
                  key={s.starId}
                  className={`sb-item ${selectedDocumentId === s.documentId ? "active" : ""}`}
                  style={{ paddingLeft: "8px" }}
                >
                  <span className="sb-star-icon">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--color-star)">
                      <path d="M8 1.5l1.94 3.93 4.34.63-3.14 3.06.74 4.32L8 11.4l-3.88 2.04.74-4.32L1.72 6.06l4.34-.63L8 1.5z" />
                    </svg>
                  </span>
                  <a
                    href={`#/document/${s.documentId}`}
                    className="sb-link"
                    onClick={(e) => {
                      e.preventDefault();
                      selectDocument(s.documentId);
                      navigate(`/document/${s.documentId}`);
                    }}
                    title={s.title}
                  >
                    {s.emoji && <span className="sb-emoji">{s.emoji}</span>}
                    <span className="sb-title">{s.title}</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                      <span
                        className="sb-dot"
                        style={{ backgroundColor: col.color || "#0366d6" }}
                      />
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
