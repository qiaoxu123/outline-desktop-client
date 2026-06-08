import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
  OutlineDocument,
} from "@outline/shared-types";

interface Crumb {
  label: string;
  emoji?: string | null;
  onClick?: () => void;
}

/** Walk a nested document tree to the target, returning the ancestor chain. */
function findDocPath(
  nodes: OutlineCollectionDocument[],
  targetId: string,
): OutlineCollectionDocument[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return [n];
    if (n.children && n.children.length) {
      const sub = findDocPath(n.children, targetId);
      if (sub) return [n, ...sub];
    }
  }
  return null;
}

function CrumbIcon({ emoji }: { emoji?: string | null }): React.ReactElement | null {
  if (!emoji) return null;
  return <span className="crumb-emoji">{emoji}</span>;
}

/**
 * wolai-style location path in the title bar: Workspace › Collection › Document.
 * Reuses the same query cache the views populate, so no extra requests.
 */
export default function Breadcrumb(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const location = useLocation();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { team } = useUserInfo();
  const path = location.pathname;

  const docId = path.startsWith("/document/")
    ? path.slice("/document/".length)
    : null;
  const colId = path.startsWith("/collection/")
    ? path.slice("/collection/".length)
    : null;

  const { data: docData } = useQuery({
    queryKey: ["profile", activeProfileId, "document", docId],
    queryFn: () =>
      unwrapIpc<{ data: OutlineDocument }>(
        api.documents.info(activeProfileId!, docId!),
      ),
    enabled: !!activeProfileId && !!docId,
  });

  const { data: colsData } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      unwrapIpc<{ data: OutlineCollection[] }>(
        api.collections.list(activeProfileId!),
      ),
    enabled: !!activeProfileId,
  });

  const collectionId = docData?.data?.collectionId ?? null;

  // The collection's nested document tree gives us the doc's ancestor chain
  // (shared cache with the sidebar — no extra request when already expanded).
  const { data: treeData } = useQuery({
    queryKey: ["profile", activeProfileId, "collection", collectionId, "documents"],
    queryFn: () =>
      unwrapIpc<{ data: OutlineCollectionDocument[] }>(
        api.collections.documents(activeProfileId!, collectionId!),
      ),
    enabled: !!activeProfileId && !!collectionId,
  });

  const collections = colsData?.data ?? [];
  const crumbs: Crumb[] = [
    { label: team?.name ?? "Workspace", onClick: () => navigate("/") },
  ];

  if (docId) {
    const doc = docData?.data;
    const col = doc?.collectionId
      ? collections.find((c) => c.id === doc.collectionId)
      : undefined;
    if (col) {
      crumbs.push({
        label: col.name,
        emoji: col.icon,
        onClick: () => navigate(`/collection/${col.id}`),
      });
    }
    // Full ancestor chain within the collection (parent documents), then the
    // current document last. Falls back to just the doc title if the tree
    // hasn't loaded yet.
    const path = treeData?.data ? findDocPath(treeData.data, docId) : null;
    if (path && path.length) {
      path.forEach((node, i) => {
        const isLast = i === path.length - 1;
        crumbs.push({
          label: node.title || "Untitled",
          emoji: node.emoji,
          onClick: isLast
            ? undefined
            : () => navigate(`/document/${node.id}`),
        });
      });
    } else {
      crumbs.push({ label: doc?.title || "Untitled", emoji: doc?.emoji });
    }
  } else if (colId) {
    const col = collections.find((c) => c.id === colId);
    crumbs.push({ label: col?.name ?? "集合", emoji: col?.icon });
  } else if (path === "/search") {
    crumbs.push({ label: "搜索" });
  } else if (path === "/shares") {
    crumbs.push({ label: "共享链接" });
  } else if (path === "/settings") {
    crumbs.push({ label: "设置" });
  } else {
    crumbs.push({ label: "主页" });
  }

  return (
    <nav className="breadcrumb">
      {crumbs.map((c, i) => (
        <span className="crumb-group" key={i}>
          {i > 0 && <span className="crumb-sep">›</span>}
          {c.onClick && i < crumbs.length - 1 ? (
            <button className="crumb crumb-link" onClick={c.onClick} title={c.label}>
              <CrumbIcon emoji={c.emoji} />
              <span className="crumb-text">{c.label}</span>
            </button>
          ) : (
            <span className={`crumb ${i === crumbs.length - 1 ? "crumb-current" : ""}`}>
              <CrumbIcon emoji={c.emoji} />
              <span className="crumb-text">{c.label}</span>
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
