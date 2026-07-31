import { useState } from "react";
import Heatmap from "./Heatmap";

const TAG_COLLAPSED_COUNT = 8;

/** 随记左栏：统计条 + 热力图 + 标签导航（全部笔记 / 全部标签）。 */
export default function NotesRail({
  noteCount,
  tagCount,
  activeDays,
  streak,
  counts,
  selectedDay,
  onSelectDay,
  tags,
  activeTag,
  onSelectTag,
  onClearTag,
}: {
  noteCount: number;
  tagCount: number;
  activeDays: number;
  streak: number;
  counts: Map<string, number>;
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
  tags: [string, number][];
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onClearTag: () => void;
}): React.ReactElement {
  const [showAllTags, setShowAllTags] = useState(false);
  // 折叠标签列表：默认只显示前 N 个（已按出现次数降序），其余收进「展开全部」。
  // 若当前选中的标签在折叠区之外，则临时把它带出来，避免选中态看不见。
  const activeIdx = activeTag ? tags.findIndex(([t]) => t === activeTag) : -1;
  const overflow = tags.length - TAG_COLLAPSED_COUNT;
  const visibleTags =
    showAllTags || tags.length <= TAG_COLLAPSED_COUNT
      ? tags
      : (() => {
          const head = tags.slice(0, TAG_COLLAPSED_COUNT);
          if (activeIdx >= TAG_COLLAPSED_COUNT) head.push(tags[activeIdx]);
          return head;
        })();

  return (
    <aside className="nt-rail">
      <div className="nt-rail-stats">
        <Stat n={noteCount} label="笔记" />
        <Stat n={tagCount} label="标签" />
        <Stat
          n={activeDays}
          label="天"
          title={streak > 0 ? `连续记录 ${streak} 天` : undefined}
        />
      </div>

      <Heatmap counts={counts} selected={selectedDay} onSelectDay={onSelectDay} />

      <nav className="nt-rail-nav">
        <button
          className={`nt-nav-item${!activeTag ? " active" : ""}`}
          onClick={onClearTag}
        >
          <span className="nt-nav-ico">▦</span>
          <span className="nt-nav-label">全部笔记</span>
        </button>
      </nav>

      {tags.length > 0 && (
        <div className="nt-rail-tags">
          <div className="nt-rail-heading">全部标签</div>
          {visibleTags.map(([t, c]) => (
            <button
              key={t}
              className={`nt-nav-item${activeTag === t ? " active" : ""}`}
              onClick={() => onSelectTag(t)}
            >
              <span className="nt-nav-ico">#</span>
              <span className="nt-nav-label">{t}</span>
              <span className="nt-nav-count">{c}</span>
            </button>
          ))}
          {overflow > 0 && (
            <button
              className="nt-tags-toggle"
              onClick={() => setShowAllTags((v) => !v)}
            >
              {showAllTags ? "收起" : `展开全部 ${tags.length} 个`}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function Stat({
  n,
  label,
  title,
}: {
  n: number;
  label: string;
  title?: string;
}): React.ReactElement {
  return (
    <div className="nt-stat" title={title}>
      <div className="nt-stat-num">{n}</div>
      <div className="nt-stat-label">{label}</div>
    </div>
  );
}
