import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import "./SharesView.css";

interface ShareItem {
  id: string;
  url: string;
  published?: boolean;
  documentId?: string;
  documentTitle?: string;
  documentUrl?: string;
  createdBy?: { name: string };
  lastAccessedAt?: string | null;
  views?: number;
  createdAt: string;
}

interface SharesResponse {
  data: ShareItem[];
}

export default function SharesView(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectDocument = useUIStore((s) => s.selectDocument);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "shares"],
    queryFn: () =>
      unwrapIpc<SharesResponse>(api.call(activeProfileId!, "shares.list")),
    enabled: !!activeProfileId,
  });

  const shares = data?.data ?? [];

  return (
    <div className="shares-view">
      <h2 className="shares-title">共享链接</h2>
      <p className="shares-subtitle">
        知识库中已通过公开链接分享的文档（权限不足时仅显示你自己创建的共享）。
      </p>

      {isLoading && <p className="shares-empty">加载中…</p>}
      {!!error && (
        <p className="shares-empty shares-error">
          无法加载共享列表，可能没有权限。
        </p>
      )}
      {!isLoading && !error && shares.length === 0 && (
        <p className="shares-empty">还没有共享的文档</p>
      )}

      {shares.length > 0 && (
        <div className="shares-list">
          {shares.map((share) => (
            <div key={share.id} className="share-item">
              <div className="share-main">
                <a
                  href={share.documentId ? `#/document/${share.documentId}` : share.url}
                  className="share-doc-title"
                  onClick={(e) => {
                    if (share.documentId) {
                      e.preventDefault();
                      selectDocument(share.documentId);
                      navigate(`/document/${share.documentId}`);
                    }
                  }}
                >
                  {share.documentTitle || "Untitled"}
                </a>
                <div className="share-meta">
                  {share.createdBy?.name && <span>{share.createdBy.name} 分享</span>}
                  <span>· {new Date(share.createdAt).toLocaleDateString()}</span>
                  {typeof share.views === "number" && (
                    <span>· {share.views} 次访问</span>
                  )}
                  {share.published === false && <span className="share-draft">未发布</span>}
                </div>
              </div>
              <button
                className="share-copy"
                onClick={() => void navigator.clipboard.writeText(share.url)}
                title="复制公开链接"
              >
                复制链接
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
