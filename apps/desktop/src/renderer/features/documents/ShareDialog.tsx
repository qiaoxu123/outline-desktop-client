import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { OIcon } from "../../components/outlineIcons";
import "./ShareDialog.css";

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

interface UserListResponse {
  data: TeamMember[];
}

/**
 * Share dialog: let the user pick a team member to share with via
 * documents.add_user, then send an @mention comment as notification.
 * Also retains the copy-link fallback.
 */
export function ShareDialog({
  documentId,
  documentTitle,
  url,
  onClose,
}: {
  documentId: string;
  documentTitle: string;
  url: string;
  onClose: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null); // userId being shared
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "users"],
    queryFn: () =>
      unwrapIpc<UserListResponse>(
        api.call(activeProfileId!, "users.list", { limit: 200 }),
      ),
    enabled: !!activeProfileId,
  });

  const members = useMemo(() => {
    const all = data?.data ?? [];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const handleShare = async (member: TeamMember) => {
    if (!activeProfileId) return;
    setSharing(member.id);
    setFeedback(null);
    try {
      // 1. Grant document access
      await unwrapIpc(
        api.call(activeProfileId, "documents.add_user", {
          id: documentId,
          userId: member.id,
        }),
      );
      // 2. Send @mention notification comment
      const content = [
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: { id: member.id, label: member.name },
            },
            { type: "text", text: " 分享了一篇笔记：" },
            {
              type: "text",
              marks: [{ type: "em" }],
              text: documentTitle,
            },
          ],
        },
      ];
      try {
        await unwrapIpc(
          api.call(activeProfileId, "comments.create", {
            documentId,
            data: { type: "doc", content },
          }),
        );
      } catch {
        // Comment notification is best-effort; access already granted above.
      }
      setFeedback({ type: "success", message: `已分享给 ${member.name}` });
      setTimeout(onClose, 1500);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `分享失败：${err instanceof Error ? err.message : "未知错误"}`,
      });
    } finally {
      setSharing(null);
    }
  };

  const copy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const memberInitials = (name: string) =>
    name.slice(0, 1).toUpperCase();

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="share-header">
          <span className="share-title">
            <OIcon name="globe" size={16} /> 分享此文档
          </span>
          <button className="share-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Team member sharing */}
        <p className="share-desc">分享给团队成员（点击即发送通知）</p>

        <input
          className="share-search"
          type="text"
          placeholder="搜索成员…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="share-members">
          {isLoading && (
            <p className="share-note">加载成员列表…</p>
          )}
          {!!error && (
            <p className="share-note share-error">
              无法加载成员列表（
              {error instanceof Error ? error.message : "未知错误"}）
            </p>
          )}
          {!isLoading && !error && members.length === 0 && (
            <p className="share-note">无匹配成员</p>
          )}
          {!isLoading &&
            !error &&
            members.map((m) => (
              <div key={m.id} className="share-member-row">
                <div className="share-member-avatar">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name} />
                  ) : (
                    memberInitials(m.name)
                  )}
                </div>
                <div className="share-member-info">
                  <span className="share-member-name">{m.name}</span>
                  {m.email && (
                    <span className="share-member-email">{m.email}</span>
                  )}
                </div>
                <button
                  className="share-member-btn"
                  disabled={sharing === m.id}
                  onClick={() => handleShare(m)}
                  title={`分享给 ${m.name}`}
                >
                  {sharing === m.id ? "…" : "分享"}
                </button>
              </div>
            ))}
        </div>

        {feedback && (
          <p
            className={`share-feedback ${feedback.type === "error" ? "share-error" : ""}`}
          >
            {feedback.message}
          </p>
        )}

        {/* Divider */}
        <div className="share-divider">
          <span>或者</span>
        </div>

        {/* Copy link fallback */}
        <p className="share-desc">复制链接手动分享</p>
        <div className="share-url-row">
          <input
            className="share-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className="share-copy" onClick={copy}>
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <p className="share-hint">
          仅登录且有权限的成员可打开，不对外公开。
        </p>
      </div>
    </div>
  );
}
