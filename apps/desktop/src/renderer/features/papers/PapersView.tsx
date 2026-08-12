import { useEffect, useMemo, useRef, useState } from "react";
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
  useRecentlyViewedRank,
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

type SortKey = "updated" | "views" | "likes" | "score" | "title";

/** Which slice of the library to show. */
type Scope = "all" | "liked" | "history";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "liked", label: "我赞过" },
  { value: "history", label: "最近浏览" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "更新时间 新→旧" },
  { value: "views", label: "阅读人数 多→少" },
  { value: "likes", label: "点赞 多→少" },
  { value: "score", label: "评分 高→低" },
  { value: "title", label: "标题 A→Z" },
];

/**
 * Session-scoped memory of the last search / filter / sort. Opening a paper
 * navigates to /document/:id, which unmounts this view; going back remounts it
 * and would otherwise reset every control to its default (the full library,
 * scrolled to top — feels like landing on a fresh page). Seeding the initial
 * state from here restores the user's previous result list. Cleared on app
 * restart, mirroring AppShell's per-route scroll memory.
 */
type PapersUiState = {
  q: string;
  tag: string | null;
  readFilter: ReadState | null;
  sortKey: SortKey;
  scope: Scope;
};
let savedUi: PapersUiState = {
  q: "",
  tag: null,
  readFilter: null,
  sortKey: "updated",
  scope: "all",
};

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
        {meta?.enTitle && (
          <div className="paper-en-title" title={meta.enTitle}>
            {meta.enTitle}
          </div>
        )}
        <div className="paper-meta-line">
          {paper.year && (
            <span className="paper-when">
              推荐阅读 · {paper.year} · {paper.month ?? "?"}月
            </span>
          )}
          {!paper.year && paper.topic && (
            <span className="paper-when">
              {paper.source === "internal"
                ? "组内工作"
                : paper.source === "peer"
                  ? `同行成果 · ${paper.topic}`
                  : `精选 · ${paper.topic}`}
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
            <span className="paper-views">{viewCount} 人读过</span>
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

      {meta?.code && (
        <button
          className="paper-code-btn"
          title="开源代码仓库"
          onClick={(e) => {
            e.stopPropagation();
            window.open(meta.code!);
          }}
        >
          <OIcon name="code" size={16} />
        </button>
      )}
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
  const { rank: historyRank } = useRecentlyViewedRank();
  const { stateFor, cycle } = useReadStates();
  const { menu: contextMenu, onContextMenu } = useDocContextMenu();

  const [q, setQ] = useState(savedUi.q);
  const [tag, setTag] = useState<string | null>(savedUi.tag);
  const [readFilter, setReadFilter] = useState<ReadState | null>(savedUi.readFilter);
  const [sortKey, setSortKey] = useState<SortKey>(savedUi.sortKey);
  const [scope, setScope] = useState<Scope>(savedUi.scope);

  // Persist search / filter / sort so back-navigation restores this exact list
  // (paired with AppShell's per-route scroll restore for /papers).
  useEffect(() => {
    savedUi = { q, tag, readFilter, sortKey, scope };
  }, [q, tag, readFilter, sortKey, scope]);

  // Changing search/filter/sort re-composes the list from the top, so jump
  // the shared scroll container back up — otherwise a previously scrolled
  // position leaves the user staring at the middle of the new result set.
  const filtersDirty = useRef(false);
  useEffect(() => {
    if (!filtersDirty.current) {
      filtersDirty.current = true; // skip initial mount (scroll restore owns it)
      return;
    }
    document.querySelector(".app-content")?.scrollTo({ top: 0 });
  }, [q, tag, readFilter, sortKey, scope]);

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

  // 全部 / 我赞过 / 最近浏览 pick which papers are eligible before filtering.
  const base = useMemo(() => {
    if (scope === "liked") return papers.filter((p) => summaryFor(p.id).myLike);
    if (scope === "history")
      return papers.filter((p) => historyRank.has(p.id));
    return papers;
    // summaryFor closes over the interactions registry; re-run when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, scope, historyRank, summaryFor]);

  const filtered = base.filter((p) => {
    if (readFilter !== null && stateFor(p.id) !== readFilter) return false;
    const meta = metas.get(p.id);
    if (tag !== null && !(meta?.tags ?? []).includes(tag)) return false;
    if (q.trim()) {
      const hay = `${p.title} ${meta?.enTitle ?? ""} ${meta?.venue ?? ""} ${meta?.authors ?? ""} ${meta?.org ?? ""} ${meta?.link ?? ""} ${(meta?.tags ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const sorted = useMemo(() => {
    // 最近浏览 is inherently ordered by when I last opened each paper.
    if (scope === "history") {
      const r = (p: PaperEntry): number => historyRank.get(p.id) ?? Infinity;
      return [...filtered].sort((a, b) => r(a) - r(b));
    }
    if (sortKey === "updated") {
      // One ordering key for the whole library: the document's last-updated
      // time (newest first), regardless of 年/月 folder or 精选专题 origin.
      // Papers whose metadata isn't loaded yet (a handful of 精选论文 docs the
      // paged documents.list can't reach past its server-side limit) sort last,
      // NOT to the top — otherwise those un-dated papers would outrank genuinely
      // recent ones. Freshly interpreted papers DO get metadata via the short
      // staleTime refresh, so they still surface at the top by their real time.
      const ts = (p: PaperEntry): number => {
        const updated = metas.get(p.id)?.updatedAt;
        const d = updated ? new Date(updated) : null;
        return d && !isNaN(d.getTime()) ? d.getTime() : 0;
      };
      return [...filtered].sort((a, b) => ts(b) - ts(a));
    }
    if (sortKey === "title") return sortDocsByTitle(filtered);
    const cmp: Record<
      Exclude<SortKey, "updated" | "title">,
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
  }, [filtered, sortKey, views, summaryFor, metas, scope, historyRank]);

  const readCount = papers.filter((p) => stateFor(p.id) === "read").length;
  // Chip counts (cheap over ~800 papers; summaryFor/historyRank change rarely).
  const likedCount = useMemo(
    () => papers.filter((p) => summaryFor(p.id).myLike).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [papers, summaryFor],
  );
  const historyCount = useMemo(
    () => papers.filter((p) => historyRank.has(p.id)).length,
    [papers, historyRank],
  );

  return (
    <div className="papers-view">
      <header className="papers-header">
        <div>
          <h2>论文库</h2>
          <p className="papers-hint">
            推荐阅读目录的检索视图 — 默认按笔记更新时间排序,可按领域、状态与关键词查找。
          </p>
        </div>
        <span className="papers-stats">
          {scope === "all"
            ? `共 ${papers.length} 篇 · 已读 ${readCount} 篇`
            : `${SCOPE_OPTIONS.find((s) => s.value === scope)?.label} ${base.length} 篇`}
        </span>
      </header>

      <div className="papers-scope">
        {SCOPE_OPTIONS.map((o) => {
          const n =
            o.value === "liked"
              ? likedCount
              : o.value === "history"
                ? historyCount
                : papers.length;
          return (
            <button
              key={o.value}
              className={`papers-scope-btn ${scope === o.value ? "active" : ""}`}
              onClick={() => setScope(o.value)}
            >
              {o.label}
              <span className="papers-scope-count">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="papers-filters">
        <input
          className="papers-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题 / 领域 / 作者 / 机构…"
        />
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
          value={scope === "history" ? "" : sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          title={scope === "history" ? "最近浏览按浏览时间排序" : "排序"}
          disabled={scope === "history"}
        >
          {scope === "history" ? (
            <option value="">浏览时间 新→旧</option>
          ) : (
            SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          )}
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
        <p className="papers-note">
          {scope === "liked"
            ? "还没有赞过的论文 — 在论文行或阅读页点 👍 即可收藏到这里。"
            : scope === "history"
              ? "暂无浏览记录 — 打开任意论文后会自动记录在这里。"
              : "没有匹配的论文。"}
        </p>
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
