import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import "./HomeView.css";

interface DocListItem {
  id: string;
  title: string;
  emoji?: string | null;
  updatedAt: string;
  updatedBy?: { name: string };
}

interface DocListResponse {
  data: DocListItem[];
}

function DocList({
  title,
  docs,
  emptyText,
}: {
  title: string;
  docs: DocListItem[];
  emptyText: string;
}): React.ReactElement {
  const navigate = useNavigate();
  const selectDocument = useUIStore((s) => s.selectDocument);

  return (
    <section className="home-section">
      <h3 className="home-section-title">{title}</h3>
      {docs.length === 0 ? (
        <p className="home-empty">{emptyText}</p>
      ) : (
        <div className="home-doc-list">
          {docs.map((doc) => (
            <a
              key={doc.id}
              href={`#/document/${doc.id}`}
              className="home-doc-item"
              onClick={(e) => {
                e.preventDefault();
                selectDocument(doc.id);
                navigate(`/document/${doc.id}`);
              }}
            >
              <span className="home-doc-title">
                {doc.emoji && <span className="home-doc-emoji">{doc.emoji}</span>}
                {doc.title || "Untitled"}
              </span>
              <span className="home-doc-meta">
                {doc.updatedBy?.name && `${doc.updatedBy.name} · `}
                {new Date(doc.updatedAt).toLocaleDateString()}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomeView(): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();

  const viewed = useQuery({
    queryKey: ["profile", activeProfileId, "home", "viewed"],
    queryFn: () =>
      unwrapIpc<DocListResponse>(
        api.call(activeProfileId!, "documents.viewed", { limit: 10 }),
      ),
    enabled: !!activeProfileId,
  });

  const updated = useQuery({
    queryKey: ["profile", activeProfileId, "home", "updated"],
    queryFn: () =>
      unwrapIpc<DocListResponse>(
        api.call(activeProfileId!, "documents.list", {
          sort: "updatedAt",
          direction: "desc",
          limit: 10,
        }),
      ),
    enabled: !!activeProfileId,
  });

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  return (
    <div className="home-view">
      <header className="home-header">
        <h1 className="home-greeting">
          {greeting}
          {user?.name ? `，${user.name}` : ""}
        </h1>
      </header>

      {(viewed.isLoading || updated.isLoading) && (
        <p className="home-empty">加载中…</p>
      )}

      {!viewed.isLoading && (
        <DocList
          title="最近查看"
          docs={viewed.data?.data ?? []}
          emptyText="还没有查看过任何文档"
        />
      )}

      {!updated.isLoading && (
        <DocList
          title="最近更新"
          docs={updated.data?.data ?? []}
          emptyText="知识库还没有文档"
        />
      )}
    </div>
  );
}
