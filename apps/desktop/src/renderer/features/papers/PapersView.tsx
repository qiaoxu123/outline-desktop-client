import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  usePapersRoot,
  usePaperEntries,
  usePaperMetas,
  useReadStates,
  type PaperEntry,
  type PaperMeta,
  type ReadState,
} from "./usePapers";
import "./PapersView.css";

const READ_LABEL: Record<ReadState, string> = {
  unread: "未读",
  reading: "在读",
  read: "已读",
};

function PaperRow({
  paper,
  meta,
  readState,
  onOpen,
  onCycleRead,
  onTagClick,
}: {
  paper: PaperEntry;
  meta?: PaperMeta;
  readState: ReadState;
  onOpen: () => void;
  onCycleRead: () => void;
  onTagClick: (tag: string) => void;
}): React.ReactElement {
  return (
    <div className="paper-row" onClick={onOpen}>
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
        </div>
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10h-1.5v2.5h-8v-8H6V3zm3 0v1.5h2.44L6.5 9.44l1.06 1.06 4.94-4.94V8H14V3H9z" />
          </svg>
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
  const metas = usePaperMetas(papers);
  const { stateFor, cycle } = useReadStates();

  const [q, setQ] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadState | null>(null);

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
      {status === "ready" && !isLoading && filtered.length === 0 && (
        <p className="papers-note">没有匹配的论文。</p>
      )}

      <div className="papers-list">
        {filtered.map((p) => (
          <PaperRow
            key={p.id}
            paper={p}
            meta={metas.get(p.id)}
            readState={stateFor(p.id)}
            onOpen={() => navigate(`/document/${p.id}`)}
            onCycleRead={() => cycle(p.id)}
            onTagClick={(t) => setTag(tag === t ? null : t)}
          />
        ))}
      </div>
    </div>
  );
}
