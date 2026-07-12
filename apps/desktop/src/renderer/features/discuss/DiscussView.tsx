import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { absoluteUrl } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import {
  useDiscussCollection,
  useTopics,
  useTopicReplies,
  useTopicSeen,
  type Topic,
} from "./useDiscuss";
import "./DiscussView.css";

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
  topic,
  onOpen,
  isUnread,
}: {
  topic: Topic;
  onOpen: (id: string) => void;
  isUnread: (id: string, lastActivity: string) => boolean;
}): React.ReactElement {
  const { count, lastReplyAt } = useTopicReplies(topic.id);
  const lastActivity =
    lastReplyAt && lastReplyAt > topic.updatedAt ? lastReplyAt : topic.updatedAt;
  const unread = isUnread(topic.id, lastActivity);
  const avatar = absoluteUrl(topic.createdBy?.avatarUrl);

  return (
    <button className="topic-row" onClick={() => onOpen(topic.id)}>
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
          {topic.createdBy?.name} · 最后活动 {timeAgo(lastActivity)}
        </span>
      </span>
      <span className={`topic-replies ${count > 0 ? "" : "empty"}`}>
        {count > 0 ? `${count} 回复` : "暂无回复"}
      </span>
    </button>
  );
}

export default function DiscussView(): React.ReactElement {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { collectionId, status } = useDiscussCollection();
  const { topics, isLoading, error } = useTopics(collectionId);
  const { isUnread, markSeen } = useTopicSeen();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");

  const createTopic = useMutation({
    mutationFn: async (topicTitle: string) => {
      const res = await unwrapIpc<{ data: { id: string } }>(
        api.call(activeProfileId!, "documents.create", {
          title: topicTitle,
          text: "",
          collectionId,
          publish: true,
        }),
      );
      return res.data.id;
    },
    onSuccess: (id) => {
      setComposing(false);
      setTitle("");
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId, "discuss", collectionId],
      });
      markSeen(id);
      navigate(`/document/${id}`);
    },
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
        <button
          className="document-button primary"
          onClick={() => setComposing(true)}
          disabled={status !== "ready"}
        >
          发新帖
        </button>
      </header>

      {composing && (
        <div className="discuss-composer">
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
      {status === "ready" && !isLoading && topics.length === 0 && (
        <p className="discuss-note">还没有帖子,来发第一帖吧。</p>
      )}

      <div className="topic-list">
        {topics.map((t) => (
          <TopicRow key={t.id} topic={t} onOpen={openTopic} isUnread={isUnread} />
        ))}
      </div>
    </div>
  );
}
