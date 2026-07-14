import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { absoluteUrl, useUserInfo } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import { useDocContextMenu } from "../../hooks/useDocContextMenu";
import { OIcon } from "../../components/outlineIcons";
import {
  useDiscussCollection,
  useTopicsWithActivity,
  useTopicSeen,
  markDiscussVisited,
  type TopicWithActivity,
} from "./useDiscuss";
import "./DiscussView.css";

const UNCATEGORIZED = "__none__";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

function TopicRow({
  row,
  ownUserId,
  onOpen,
  onDelete,
  deleting,
  isUnread,
  onContextMenu,
}: {
  row: TopicWithActivity;
  ownUserId?: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
  isUnread: (id: string, lastActivity: string) => boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const { topic, replyCount, lastActivity } = row;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unread = isUnread(topic.id, lastActivity);
  const avatar = absoluteUrl(topic.createdBy?.avatarUrl);
  const own = !!ownUserId && topic.createdBy?.id === ownUserId;

  return (
    <div
      className="topic-row"
      onClick={() => onOpen(topic.id)}
      onContextMenu={onContextMenu}
    >
      <span className={`topic-dot ${unread ? "unread" : ""}`} />
      <span className="topic-avatar">
        {avatar ? (
          <img src={avatar} alt={topic.createdBy?.name} />
        ) : (
          <span className="topic-avatar-fallback">
            {(topic.createdBy?.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="topic-main">
        <span className={`topic-title ${unread ? "unread" : ""}`}>
          {topic.title || "无标题"}
        </span>
        <span className="topic-meta">
          {row.category && (
            <span className="topic-category">{row.category.title}</span>
          )}
          {topic.createdBy?.name} · 最后活动 {timeAgo(lastActivity)}
        </span>
      </span>
      <span
        className={`topic-replies ${replyCount > 0 ? "" : "empty"}`}
        title={replyCount > 0 ? `${replyCount} 回复` : "暂无回复"}
      >
        <OIcon name="comment" size={15} />
        {replyCount > 0 && <span className="topic-replies-count">{replyCount}</span>}
      </span>
      {own && (
        <button
          className={`topic-delete ${confirmDelete ? "danger" : ""}`}
          disabled={deleting}
          title={confirmDelete ? "再次点击确认删除" : "删除帖子"}
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDelete) onDelete(topic.id);
            else setConfirmDelete(true);
          }}
          onMouseLeave={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "确认删除？" : "删除"}
        </button>
      )}
    </div>
  );
}

export default function DiscussView(): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const { collectionId, status } = useDiscussCollection();
  const { rows, categories, isLoading, error } =
    useTopicsWithActivity(collectionId);
  const { isUnread, markSeen } = useTopicSeen();
  const { menu: contextMenu, onContextMenu } = useDocContextMenu();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [composeCategory, setComposeCategory] = useState<string>(UNCATEGORIZED);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Opening the board clears the sidebar "new topics" badge.
  useEffect(() => {
    markDiscussVisited();
  }, []);

  const invalidateTopics = () =>
    void queryClient.invalidateQueries({
      queryKey: ["profile", activeProfileId, "discuss", collectionId],
    });

  const createTopic = useMutation({
    mutationFn: async (topicTitle: string) => {
      const res = await unwrapIpc<{ data: { id: string } }>(
        api.call(activeProfileId!, "documents.create", {
          title: topicTitle,
          text: "",
          collectionId,
          ...(composeCategory !== UNCATEGORIZED
            ? { parentDocumentId: composeCategory }
            : {}),
          publish: true,
        }),
      );
      return res.data.id;
    },
    onSuccess: (id) => {
      setComposing(false);
      setTitle("");
      invalidateTopics();
      markSeen(id);
      navigate(`/document/${id}`);
    },
  });

  const deleteTopic = useMutation({
    mutationFn: (id: string) =>
      unwrapIpc(api.call(activeProfileId!, "documents.delete", { id })),
    onSuccess: invalidateTopics,
  });

  const openTopic = (id: string) => {
    markSeen(id);
    navigate(`/document/${id}`);
  };

  return (
    <div className="discuss-view">
      <header className="discuss-header">
        <div>
          <h2>讨论区</h2>
          <p className="discuss-hint">
            主题即文档、回复即评论,与知识库同一账号 — 好帖可直接移入知识库。
          </p>
        </div>
        <div className="discuss-header-actions">
          <button
            className="document-button subtle"
            onClick={invalidateTopics}
            title="刷新列表"
          >
            刷新
          </button>
          <button
            className="document-button primary"
            onClick={() => setComposing(true)}
            disabled={status !== "ready"}
          >
            发新帖
          </button>
        </div>
      </header>

      {composing && (
        <div className="discuss-composer">
          <select
            className="discuss-category-select"
            value={composeCategory}
            onChange={(e) => setComposeCategory(e.target.value)}
            title="选择版块"
          >
            <option value={UNCATEGORIZED}>不分版块</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            className="discuss-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="帖子标题…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                createTopic.mutate(title.trim());
              } else if (e.key === "Escape") {
                setComposing(false);
              }
            }}
          />
          <button
            className="document-button primary"
            disabled={!title.trim() || createTopic.isPending}
            onClick={() => createTopic.mutate(title.trim())}
          >
            {createTopic.isPending ? "创建中…" : "创建"}
          </button>
          <button
            className="document-button subtle"
            onClick={() => setComposing(false)}
          >
            取消
          </button>
        </div>
      )}

      {categories.length > 0 && (
        <div className="discuss-categorybar">
          <button
            className={`paper-tag ${categoryFilter === null ? "active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            全部
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`paper-tag ${categoryFilter === c.id ? "active" : ""}`}
              onClick={() =>
                setCategoryFilter(categoryFilter === c.id ? null : c.id)
              }
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {status === "resolving" && (
        <p className="discuss-note">正在初始化讨论区（首次会在服务器上创建集合）…</p>
      )}
      {status === "error" && (
        <p className="discuss-note error">
          讨论区初始化失败 — 请确认账号有创建集合的权限,或在服务器上手动创建名为「讨论区」的集合。
        </p>
      )}
      {isLoading && <p className="discuss-note">加载主题中…</p>}
      {!!error && <p className="discuss-note error">主题列表加载失败</p>}
      {status === "ready" && !isLoading && rows.length === 0 && (
        <p className="discuss-note">还没有帖子,来发第一帖吧。</p>
      )}

      <div className="topic-list">
        {rows
          .filter((row) => !categoryFilter || row.category?.id === categoryFilter)
          .map((row) => (
          <TopicRow
            key={row.topic.id}
            row={row}
            ownUserId={user?.id}
            onOpen={openTopic}
            onDelete={(id) => deleteTopic.mutate(id)}
            deleting={deleteTopic.isPending}
            isUnread={isUnread}
            onContextMenu={(e) =>
              onContextMenu(e, {
                documentId: row.topic.id,
                title: row.topic.title || "无标题",
              })
            }
          />
        ))}
      </div>
      {contextMenu}
    </div>
  );
}
