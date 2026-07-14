import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../../components/outlineIcons";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo, canUserEdit } from "../../hooks/useOutline";
import {
  useMarkdownEditor,
  getMarkdown,
  MarkdownEditorContent,
} from "../documents/Editor";
import { unwrapIpc } from "../../lib/ipc";
import type { OutlineCollectionDocument } from "@outline/shared-types";
import "./CollectionsView.css";

interface CollectionDocumentsResponse {
  data: OutlineCollectionDocument[];
}

interface CollectionInfo {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export default function CollectionsView(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const { collectionId } = useParams<{ collectionId?: string }>();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [tab, setTab] = useState<"overview" | "docs">("overview");

  // reset to the overview tab whenever the collection changes
  useEffect(() => {
    setTab("overview");
  }, [collectionId]);

  const { data: info } = useQuery({
    queryKey: ["profile", activeProfileId, "collection", collectionId, "info"],
    queryFn: () =>
      unwrapIpc<{ data: CollectionInfo }>(
        api.call(activeProfileId!, "collections.info", { id: collectionId }),
      ),
    enabled: !!activeProfileId && !!collectionId,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "profile",
      activeProfileId,
      "collection",
      collectionId,
      "documents",
    ],
    queryFn: () =>
      unwrapIpc<CollectionDocumentsResponse>(
        api.collections.documents(activeProfileId!, collectionId ?? ""),
      ),
    enabled: !!activeProfileId && !!collectionId,
  });

  if (!collectionId) {
    return (
      <div className="collections-home">
        <div className="home-hero">
          <div className="home-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="16" fill="#e8edff" />
              <path
                d="M20 24h24v3H20v-3zm0 8h24v3H20v-3zm0 8h16v3H20v-3z"
                fill="#4c6ef5"
              />
            </svg>
          </div>
          <h2>JLUMCNS-MEC Knowledge Base</h2>
          <p>
            Select a collection from the sidebar to browse documents, or use
            search to find specific content.
          </p>
        </div>
      </div>
    );
  }

  const collection = info?.data;
  const documents = data?.data ?? [];
  const emoji =
    collection?.icon && /\p{Extended_Pictographic}/u.test(collection.icon)
      ? collection.icon
      : null;

  return (
    <div className="collections-view">
      <header className="collection-header">
        <div className="collection-title">
          {emoji ? (
            <span className="collection-emoji">{emoji}</span>
          ) : (
            <OIcon
              name="collection"
              size={26}
              color={collection?.color || "var(--color-primary)"}
            />
          )}
          <h1>{collection?.name ?? "…"}</h1>
        </div>
        <nav className="collection-tabs">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            概览
          </button>
          <button
            className={tab === "docs" ? "active" : ""}
            onClick={() => setTab("docs")}
          >
            文档{documents.length > 0 ? ` ${documents.length}` : ""}
          </button>
        </nav>
      </header>

      {tab === "overview" &&
        (collection ? (
          <CollectionOverview key={collection.id} collection={collection} />
        ) : (
          <div className="collections-loading">
            <div className="collections-skeleton" style={{ width: "80%" }} />
            <div className="collections-skeleton" style={{ width: "60%" }} />
          </div>
        ))}

      {tab === "docs" && (
        <>
          {isLoading && (
            <div className="collections-loading">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="collections-skeleton"
                  style={{ width: `${70 + (i % 3) * 10}%` }}
                />
              ))}
            </div>
          )}
          {error && (
            <div className="collections-error">
              <p>Failed to load documents. Please check your connection.</p>
            </div>
          )}
          {!isLoading && !error && documents.length === 0 && (
            <div className="collections-empty-list">
              <p>This collection is empty</p>
            </div>
          )}
          <div className="document-tree">
            <DocumentTree
              documents={documents}
              onSelect={(docId) => navigate(`/document/${docId}`)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- editable collection overview (概览 = collection.description) ---------- */

function CollectionOverview({
  collection,
}: {
  collection: CollectionInfo;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const queryClient = useQueryClient();
  const { user } = useUserInfo();
  const editable = canUserEdit(user);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const editor = useMarkdownEditor(collection.description ?? "", editable);
  const pendingRef = useRef(collection.description ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await unwrapIpc(
        api.call(activeProfileId!, "collections.update", {
          id: collection.id,
          description: pendingRef.current,
        }),
      );
      setSaveState("saved");
      queryClient.setQueryData<{ data: CollectionInfo }>(
        ["profile", activeProfileId, "collection", collection.id, "info"],
        (old) =>
          old
            ? {
                data: { ...old.data, description: pendingRef.current },
              }
            : old,
      );
    } catch {
      setSaveState("error");
    }
  }, [api, activeProfileId, collection.id, queryClient]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      if (!editor.isFocused) return; // ignore load-time normalization
      pendingRef.current = getMarkdown(editor);
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void doSave(), 1200);
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editor, doSave]);

  const SAVE_LABEL: Record<string, string> = {
    saving: "保存中…",
    saved: "已保存",
    error: "保存失败",
  };

  return (
    <div className="collection-overview document-body">
      {editable && saveState !== "idle" && (
        <div className={`collection-save ${saveState}`}>
          {SAVE_LABEL[saveState]}
        </div>
      )}
      {!editable && !(collection.description ?? "").trim() && (
        <p className="collections-empty-list">这个集合还没有概览说明。</p>
      )}
      <MarkdownEditorContent editor={editor} />
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
          <a
            href={`#/document/${doc.id}`}
            className="document-tree-item"
            style={{ paddingLeft: `${16 + depth * 20}px` }}
            onClick={(e) => {
              e.preventDefault();
              onSelect(doc.id);
            }}
          >
            <span className="document-tree-icon">
              {doc.emoji ? (
                <span className="document-tree-emoji">{doc.emoji}</span>
              ) : (
                <OIcon name="document" size={18} style={{ opacity: 0.7 }} />
              )}
            </span>
            <span className="document-tree-title">
              {doc.title || "Untitled"}
            </span>
          </a>
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
