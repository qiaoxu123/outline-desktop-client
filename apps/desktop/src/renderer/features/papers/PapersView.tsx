import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocContextMenu } from "../../hooks/useDocContextMenu";
import { OIcon } from "../../components/outlineIcons";
import { sortDocsByTitle } from "../../lib/naturalSort";
import {
  usePapersRoot,
  usePaperEntries,
  usePaperMetas,
  usePaperInteractions,
  usePaperViews,
  useReadStates,
  type PaperEntry,
  type PaperMeta,
  type PaperInteractionSummary,
  type ReadState,
} from "./usePapers";
import "./PapersView.css";

const READ_LABEL: Record<ReadState, string> = {
  unread: "未读",
  reading: "在读",
  read: "已读",
};

type SortKey = "recommended" | "views" | "likes" | "score" | "title";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "推荐时间 新→旧" },
  { value: "views", label: "阅读量 多→少" },
  { value: "likes", label: "点赞 多→少" },
  { value: "score", label: "评分 高→低" },
  { value: "title", label: "标题 A→Z" },
];

function StarPicker({
  myScore,
  onPick,
}: {
  myScore: number | null;
  onPick: (score: number | null) => void;
}): React.ReactElement {
  const [hover, setHover] = useState(0);
  return (
    <div className="paper-star-pop" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          className={`paper-star ${s <= (hover || myScore || 0) ? "on" : ""}`}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onPick(s === myScore ? null : s)}
          title={s === myScore ? "再点一次清除我的评分" : `打 ${s} 星`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function PaperRow({
  paper,
  meta,
  readState,
  interaction,
  viewCount,
  canInteract,
  onOpen,
  onCycleRead,
  onTagClick,
  onToggleLike,
  onSetScore,
  onContextMenu,
}: {
  paper: PaperEntry;
  meta?: PaperMeta;
  readState: ReadState;
  interaction: PaperInteractionSummary;
  viewCount: number | undefined;
  canInteract: boolean;
  onOpen: () => void;
  onCycleRead: () => void;
  onTagClick: (tag: string) => void;
  onToggleLike: () => void;
  onSetScore: (score: number | null) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const [starOpen, setStarOpen] = useState(false);
  const { likes, myLike, scoreAvg, scoreCount, myScore } = interaction;

  return (
    <div className="paper-row" onClick={onOpen} onContextMenu={onContextMenu}>
      <div className="paper-main">
        <div className="paper-title">
          {paper.emoji && <span>{paper.emoji} </span>}
          {paper.title.replace(/^📖\s*/, "")}
        </div>
        <div className="paper-meta-line">
          {paper.year && (
            <span className="paper-when">
              推荐于 {paper.year}·{paper.month ?? "?"}月
            </span>
          )}
          {meta?.venue && <span className="paper-venue">{meta.venue}</span>}
          {meta?.tags.slice(0, 5).map((t) => (
            <button
              key={t}
              className="paper-tag"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(t);
              }}
            >
              {t}
            </button>
          ))}
          {meta && !meta.parsed && (
            <span className="paper-unparsed">未整理</span>
          )}
          {(viewCount ?? 0) > 0 && (
            <span className="paper-views">{viewCount} 阅读</span>
          )}
        </div>
      </div>

      <button
        className={`paper-like-btn ${myLike ? "liked" : ""}`}
        disabled={!canInteract}
        title={myLike ? "取消点赞" : "点赞"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike();
        }}
      >
        <OIcon name="thumbsUp" size={15} />
        {likes > 0 && <span>{likes}</span>}
      </button>

      <div
        className="paper-score-wrap"
        onMouseLeave={() => setStarOpen(false)}
      >
        <button
          className={`paper-score-chip ${myScore ? "rated" : ""}`}
          disabled={!canInteract}
          title={
            scoreCount > 0
              ? `平均 ${scoreAvg!.toFixed(1)} 分 · ${scoreCount} 人评分${myScore ? ` · 我的 ${myScore} 星` : ""}`
              : "还没有人评分，点击打分"
          }
          onClick={(e) => {
            e.stopPropagation();
            setStarOpen((v) => !v);
          }}
        >
          ★{scoreCount > 0 ? ` ${scoreAvg!.toFixed(1)}` : ""}
          {scoreCount > 0 && <span className="paper-score-n">({scoreCount})</span>}
        </button>
        {starOpen && (
          <StarPicker
            myScore={myScore}
            onPick={(s) => {
              onSetScore(s);
              setStarOpen(false);
            }}
          />
        )}
      </div>

      {meta?.link && (
        <button
          className="paper-link-btn"
          title="打开论文原文"
          onClick={(e) => {
            e.stopPropagation();
            window.open(meta.link!);
          }}
        >
          <OIcon name="open" size={16} />
        </button>
      )}
      <button
        className={`paper-read-badge ${readState}`}
        title="点击切换阅读状态"
        onClick={(e) => {
          e.stopPropagation();
          onCycleRead();
        }}
      >
        {READ_LABEL[readState]}
      </button>
    </div>
  );
}

export default function PapersView(): React.ReactElement {
  const navigate = useNavigate();
  const { root, status } = usePapersRoot();
  const { papers, isLoading } = usePaperEntries(root);
  const { metas } = usePaperMetas(root);
  const { summaryFor, toggleLike, setScore, canInteract } =
    usePaperInteractions(root);
  const views = usePaperViews(papers);
  const { stateFor, cycle } = useReadStates();
  const { menu: contextMenu, onContextMenu } = useDocContextMenu();

  const [q, setQ] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadState | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recommended");

  const years = useMemo(
    () =>
      [...new Set(papers.map((p) => p.year).filter((y): y is number => !!y))].sort(
        (a, b) => b - a,
      ),
    [papers],
  );
  const months = useMemo(
    () =>
      [
        ...new Set(
          papers
            .filter((p) => year === null || p.year === year)
            .map((p) => p.month)
            .filter((m): m is number => !!m),
        ),
      ].sort((a, b) => b - a),
    [papers, year],
  );
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of metas.values()) {
      for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([t]) => t);
  }, [metas]);

  const filtered = papers.filter((p) => {
    if (year !== null && p.year !== year) return false;
    if (month !== null && p.month !== month) return false;
    if (readFilter !== null && stateFor(p.id) !== readFilter) return false;
    const meta = metas.get(p.id);
    if (tag !== null && !(meta?.tags ?? []).includes(tag)) return false;
    if (q.trim()) {
      const hay = `${p.title} ${meta?.venue ?? ""} ${meta?.authors ?? ""} ${meta?.org ?? ""} ${(meta?.tags ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const sorted = useMemo(() => {
    // papers arrive pre-sorted by recommendation time (usePaperEntries)
    if (sortKey === "recommended") return filtered;
    if (sortKey === "title") return sortDocsByTitle(filtered);
    const cmp: Record<
      Exclude<SortKey, "recommended" | "title">,
      (p: PaperEntry) => number
    > = {
      views: (p) => views.get(p.id) ?? 0,
      likes: (p) => summaryFor(p.id).likes,
      score: (p) => {
        const s = summaryFor(p.id);
        // avg dominates; rater count breaks ties among equal averages
        return (s.scoreAvg ?? 0) * 100 + s.scoreCount;
      },
    };
    const key = cmp[sortKey];
    return [...filtered].sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, views, summaryFor]);

  const readCount = papers.filter((p) => stateFor(p.id) === "read").length;

  return (
    <div className="papers-view">
      <header className="papers-header">
        <div>
          <h2>论文库</h2>
          <p className="papers-hint">
            推荐阅读目录的检索视图 — 年/月归档不变,这里按领域、状态与关键词查找。
          </p>
        </div>
        <span className="papers-stats">
          共 {papers.length} 篇 · 已读 {readCount} 篇
        </span>
      </header>

      <div className="papers-filters">
        <input
          className="papers-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题 / 领域 / 作者 / 机构…"
        />
        <select
          className="papers-select"
          value={year ?? ""}
          onChange={(e) => {
            setYear(e.target.value ? Number(e.target.value) : null);
            setMonth(null);
          }}
        >
          <option value="">全部年份</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
        <select
          className="papers-select"
          value={month ?? ""}
          onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">全部月份</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m} 月
            </option>
          ))}
        </select>
        <select
          className="papers-select"
          value={readFilter ?? ""}
          onChange={(e) => setReadFilter((e.target.value || null) as ReadState | null)}
        >
          <option value="">全部状态</option>
          <option value="unread">未读</option>
          <option value="reading">在读</option>
          <option value="read">已读</option>
        </select>
        <select
          className="papers-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          title="排序"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {allTags.length > 0 && (
        <div className="papers-tagbar">
          {allTags.map((t) => (
            <button
              key={t}
              className={`paper-tag ${tag === t ? "active" : ""}`}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {status === "resolving" && <p className="papers-note">正在定位推荐阅读目录…</p>}
      {status === "error" && (
        <p className="papers-note error">
          未找到「推荐阅读」目录 — 请确认服务器上存在该文档。
        </p>
      )}
      {isLoading && <p className="papers-note">加载论文列表…</p>}
      {status === "ready" && !isLoading && sorted.length === 0 && (
        <p className="papers-note">没有匹配的论文。</p>
      )}

      <div className="papers-list">
        {sorted.map((p) => (
          <PaperRow
            key={p.id}
            paper={p}
            meta={metas.get(p.id)}
            readState={stateFor(p.id)}
            interaction={summaryFor(p.id)}
            viewCount={views.get(p.id)}
            canInteract={canInteract}
            onOpen={() => navigate(`/document/${p.id}`)}
            onCycleRead={() => cycle(p.id)}
            onTagClick={(t) => setTag(tag === t ? null : t)}
            onToggleLike={() => toggleLike(p.id)}
            onSetScore={(s) => setScore(p.id, s)}
            onContextMenu={(e) =>
              onContextMenu(e, {
                documentId: p.id,
                title: p.title.replace(/^📖\s*/, "") || "无标题",
                emoji: p.emoji,
              })
            }
          />
        ))}
      </div>
      {contextMenu}
    </div>
  );
}
