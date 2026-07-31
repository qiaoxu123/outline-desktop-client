import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "./useNotes";
import NotesRail from "./NotesRail";
import NoteComposer from "./NoteComposer";
import MemoCard from "./MemoCard";
import {
  dayCounts,
  computeStreak,
  sortNotes,
  dayKeyOf,
  todayKey,
} from "./noteUtils";
import "./NotesView.css";

function dayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

// 页宽预设（展示卡片封顶宽度）本地记忆
const WIDTH_KEY = "notes.pageWidth.v1";
const WIDTH_PRESETS = [
  { key: "narrow", label: "窄", css: "560px" },
  { key: "standard", label: "标准", css: "680px" },
  { key: "wide", label: "宽", css: "840px" },
  { key: "full", label: "满", css: "100%" },
] as const;
type WidthKey = (typeof WIDTH_PRESETS)[number]["key"];
// 默认「宽」：随记正文与文档正文同字号（16px）后，680px 一行字数偏少
const DEFAULT_WIDTH: WidthKey = "wide";
function loadWidthKey(): WidthKey {
  const v = localStorage.getItem(WIDTH_KEY);
  return WIDTH_PRESETS.some((p) => p.key === v)
    ? (v as WidthKey)
    : DEFAULT_WIDTH;
}

export default function NotesView(): React.ReactElement {
  const nav = useNavigate();
  const n = useNotes();
  const [tag, setTag] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = useState(false);
  const [widthKey, setWidthKey] = useState(loadWidthKey);
  const widthCss =
    WIDTH_PRESETS.find((p) => p.key === widthKey)?.css ?? "840px";
  const changeWidth = (k: WidthKey) => {
    setWidthKey(k);
    localStorage.setItem(WIDTH_KEY, k);
  };

  const counts = useMemo(() => dayCounts(n.liveNotes), [n.liveNotes]);
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const note of n.liveNotes)
      for (const t of note.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [n.liveNotes]);
  const streak = useMemo(
    () => computeStreak(new Set(counts.keys()), todayKey()),
    [counts],
  );

  const filtered = useMemo(() => {
    let rows = n.liveNotes;
    if (tag) rows = rows.filter((r) => r.tags.includes(tag));
    if (day) rows = rows.filter((r) => dayKeyOf(r.createdAt) === day);
    if (q.trim())
      rows = rows.filter((r) =>
        r.content.toLowerCase().includes(q.trim().toLowerCase()),
      );
    return sortNotes(rows);
  }, [n.liveNotes, tag, day, q]);

  const trashed = useMemo(
    () =>
      n.notes
        .filter((x) => x.deletedAt)
        .sort((a, b) => (b.deletedAt! > a.deletedAt! ? 1 : -1)),
    [n.notes],
  );

  const hasFilter = !!tag || !!day || !!q.trim();
  const toggleSel = (id: string) =>
    setSel((s) => {
      const x = new Set(s);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  const clearFilters = () => {
    setTag(null);
    setDay(null);
    setQ("");
  };

  const exportMd = () => {
    const blob = new Blob([n.exportMarkdown()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `随记导出-${todayKey()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 主栏顶部标题反映当前筛选态。
  const heading = tag ? `#${tag}` : day ? dayLabel(day) : "全部笔记";

  return (
    <div className="notes-view">
      <div className="nt-cols">
        <NotesRail
          noteCount={n.liveNotes.length}
          tagCount={allTags.length}
          activeDays={counts.size}
          streak={streak}
          counts={counts}
          selectedDay={day}
          onSelectDay={setDay}
          tags={allTags}
          activeTag={tag}
          onSelectTag={(t) => setTag(tag === t ? null : t)}
          onClearTag={() => setTag(null)}
        />

        <main
          className="nt-main"
          style={{ "--nt-card-w": widthCss } as React.CSSProperties}
        >
          <div className="nt-topbar">
            <div className="nt-topbar-title">
              {heading}
              {day && (
                <button className="nt-clear" onClick={() => setDay(null)}>
                  ×
                </button>
              )}
            </div>
            <input
              className="nt-search"
              placeholder="搜索随记…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="nt-topbar-actions">
              <div className="nt-width-seg" title="随记页宽">
                {WIDTH_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    className={widthKey === p.key ? "active" : ""}
                    onClick={() => changeWidth(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                className={`nt-btn subtle${trashOpen ? " active" : ""}`}
                onClick={() => setTrashOpen((v) => !v)}
              >
                回收站{trashed.length ? `(${trashed.length})` : ""}
              </button>
              <button className="nt-btn subtle" onClick={exportMd}>
                导出
              </button>
              <button
                className={`nt-btn subtle${manage ? " active" : ""}`}
                onClick={() => {
                  setManage((v) => !v);
                  setSel(new Set());
                }}
              >
                管理
              </button>
            </div>
          </div>

          {trashOpen ? (
            <section className="nt-trash">
              <h3>回收站（30 天后自动清理）</h3>
              {trashed.length === 0 && (
                <p className="nt-empty">回收站是空的。</p>
              )}
              {trashed.map((note) => (
                <div className="nt-card trashed" key={note.id}>
                  <div className="nt-card-body">{note.content}</div>
                  <div className="nt-card-actions">
                    <button onClick={() => void n.restore(note.id)}>
                      恢复
                    </button>
                    <button
                      className="danger"
                      onClick={() => void n.hardDelete(note.id)}
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <>
              <NoteComposer onSubmit={(c, l) => void n.add(c, l)} />

              {manage && (
                <div className="nt-manage-bar">
                  <span>已选 {sel.size}</span>
                  <button
                    disabled={!sel.size}
                    onClick={() => {
                      void n.bulkPin([...sel], true);
                      setSel(new Set());
                    }}
                  >
                    批量置顶
                  </button>
                  <button
                    disabled={!sel.size}
                    className="danger"
                    onClick={() => {
                      void n.bulkDelete([...sel]);
                      setSel(new Set());
                    }}
                  >
                    批量删除
                  </button>
                </div>
              )}

              {hasFilter && (
                <div className="nt-active-filter">
                  <span>
                    筛选：{heading}
                    {q.trim() && `（含“${q.trim()}”）`} · {filtered.length} 条
                  </span>
                  <button className="nt-clear" onClick={clearFilters}>
                    清除筛选
                  </button>
                </div>
              )}

              <div className="nt-timeline">
                {n.loading && n.liveNotes.length === 0 && (
                  <p className="nt-empty">加载中…</p>
                )}
                {!n.loading && filtered.length === 0 && (
                  <p className="nt-empty">
                    {hasFilter
                      ? "没有匹配的随记。"
                      : "还没有随记，记下第一条吧。"}
                  </p>
                )}
                {filtered.map((note) => (
                  <MemoCard
                    key={note.id}
                    note={note}
                    onEdit={(c, l) => void n.update(note.id, c, l)}
                    onDelete={() => void n.softDelete(note.id)}
                    onTogglePin={() => void n.togglePin(note.id)}
                    onCopy={() =>
                      void navigator.clipboard.writeText(note.content)
                    }
                    onOpenDoc={(id) => nav(`/document/${id}`)}
                    onToggleTag={(t) => setTag(tag === t ? null : t)}
                    selectMode={manage}
                    selected={sel.has(note.id)}
                    onToggleSelect={() => toggleSel(note.id)}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
