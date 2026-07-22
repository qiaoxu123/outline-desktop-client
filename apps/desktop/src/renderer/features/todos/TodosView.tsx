import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTodos } from "./useTodos";
import TodoComposer from "./TodoComposer";
import TodoRow from "./TodoRow";
import { groupTodos, BUCKET_LABEL, todayKey } from "./todoUtils";
import type { Priority } from "./types";
import "./TodosView.css";

export default function TodosView(): React.ReactElement {
  const nav = useNavigate();
  const t = useTodos();
  const [tag, setTag] = useState<string | null>(null);
  const [prio, setPrio] = useState<Priority>(null);
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = useState(false);
  const [showDone, setShowDone] = useState(true);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of t.liveTodos)
      if (!x.done) for (const g of x.tags) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [t.liveTodos]);

  const matches = (text: string, tags: string[], p: Priority) => {
    if (tag && !tags.includes(tag)) return false;
    if (prio && p !== prio) return false;
    if (q.trim() && !text.toLowerCase().includes(q.trim().toLowerCase()))
      return false;
    return true;
  };

  const undone = useMemo(
    () =>
      t.liveTodos.filter(
        (x) => !x.done && matches(x.text, x.tags, x.priority),
      ),
    [t.liveTodos, tag, prio, q],
  );
  const done = useMemo(
    () =>
      t.liveTodos
        .filter((x) => x.done && matches(x.text, x.tags, x.priority))
        .sort((a, b) =>
          (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
        ),
    [t.liveTodos, tag, prio, q],
  );
  const groups = useMemo(() => groupTodos(undone, todayKey()), [undone]);
  const overdueCount = groups.find((g) => g.bucket === "overdue")?.items.length ?? 0;

  const trashed = useMemo(
    () =>
      t.todos
        .filter((x) => x.deletedAt)
        .sort((a, b) => (b.deletedAt! > a.deletedAt! ? 1 : -1)),
    [t.todos],
  );

  const hasFilter = !!tag || !!prio || !!q.trim();
  const toggleSel = (id: string) =>
    setSel((s) => {
      const x = new Set(s);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  const exportMd = () => {
    const blob = new Blob([t.exportMarkdown()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `待办导出-${todayKey()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rowProps = (id: string) => ({
    selectMode: manage,
    selected: sel.has(id),
    onToggleSelect: () => toggleSel(id),
    onOpenDoc: (d: string) => nav(`/document/${d}`),
    onToggleTag: (g: string) => setTag(tag === g ? null : g),
  });

  return (
    <div className="todos-view">
      <header className="td-header">
        <div className="td-header-title">
          <h2>待办</h2>
          <span className="td-stats">
            {undone.length} 项待办
            {overdueCount > 0 && (
              <span className="td-overdue"> · {overdueCount} 项逾期</span>
            )}
          </span>
        </div>
        <div className="td-header-actions">
          <button
            className={`td-btn subtle${trashOpen ? " active" : ""}`}
            onClick={() => setTrashOpen((v) => !v)}
          >
            回收站{trashed.length ? `(${trashed.length})` : ""}
          </button>
          <button className="td-btn subtle" onClick={exportMd}>
            导出
          </button>
          <button
            className={`td-btn subtle${manage ? " active" : ""}`}
            onClick={() => {
              setManage((v) => !v);
              setSel(new Set());
            }}
          >
            管理
          </button>
        </div>
      </header>

      {trashOpen ? (
        <section className="td-trash">
          <h3>回收站（30 天后自动清理）</h3>
          {trashed.length === 0 && <p className="td-empty">回收站是空的。</p>}
          {trashed.map((x) => (
            <div className="td-row trashed" key={x.id}>
              <div className="td-text">{x.text}</div>
              <span className="td-row-actions">
                <button onClick={() => void t.restore(x.id)}>恢复</button>
                <button className="danger" onClick={() => void t.hardDelete(x.id)}>
                  彻底删除
                </button>
              </span>
            </div>
          ))}
        </section>
      ) : (
        <>
          <TodoComposer onSubmit={(d) => void t.add(d)} />

          {(allTags.length > 0 || hasFilter) && (
            <div className="td-filterbar">
              <input
                className="td-search"
                placeholder="搜索待办…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {(["high", "mid", "low"] as const).map((p) => (
                <button
                  key={p}
                  className={`td-prio ${p}${prio === p ? " active" : ""}`}
                  onClick={() => setPrio(prio === p ? null : p)}
                >
                  {p === "high" ? "高" : p === "mid" ? "中" : "低"}
                </button>
              ))}
              {allTags.map(([g, c]) => (
                <button
                  key={g}
                  className={`td-tag-pill${tag === g ? " active" : ""}`}
                  onClick={() => setTag(tag === g ? null : g)}
                >
                  #{g} <span>{c}</span>
                </button>
              ))}
              {hasFilter && (
                <button
                  className="td-clear"
                  onClick={() => {
                    setTag(null);
                    setPrio(null);
                    setQ("");
                  }}
                >
                  清除筛选
                </button>
              )}
            </div>
          )}

          {manage && (
            <div className="td-manage-bar">
              <span>已选 {sel.size}</span>
              <button
                disabled={!sel.size}
                onClick={() => {
                  void t.bulkDone([...sel], true);
                  setSel(new Set());
                }}
              >
                批量完成
              </button>
              <button
                disabled={!sel.size}
                className="danger"
                onClick={() => {
                  void t.bulkDelete([...sel]);
                  setSel(new Set());
                }}
              >
                批量删除
              </button>
              <span className="td-spacer" />
              {done.length > 0 && (
                <button onClick={() => void t.clearCompleted()}>
                  清除已完成({done.length})
                </button>
              )}
            </div>
          )}

          {t.loading && t.liveTodos.length === 0 && (
            <p className="td-empty">加载中…</p>
          )}
          {!t.loading && undone.length === 0 && done.length === 0 && (
            <p className="td-empty">
              {hasFilter ? "没有匹配的待办。" : "没有待办，来添加一条吧。"}
            </p>
          )}

          {groups.map((g) => (
            <section className="td-group" key={g.bucket}>
              <h3 className={`td-group-title ${g.bucket}`}>
                {BUCKET_LABEL[g.bucket]}
                <span className="td-group-count">{g.items.length}</span>
              </h3>
              {g.items.map((x) => (
                <TodoRow
                  key={x.id}
                  todo={x}
                  onToggleDone={() => void t.toggleDone(x.id)}
                  onEdit={(d) => void t.update(x.id, d)}
                  onDelete={() => void t.softDelete(x.id)}
                  {...rowProps(x.id)}
                />
              ))}
            </section>
          ))}

          {done.length > 0 && (
            <section className="td-group done-group">
              <h3
                className="td-group-title done"
                onClick={() => setShowDone((v) => !v)}
                style={{ cursor: "pointer" }}
              >
                已完成
                <span className="td-group-count">{done.length}</span>
                <span className="td-collapse">{showDone ? "▾" : "▸"}</span>
              </h3>
              {showDone &&
                done.map((x) => (
                  <TodoRow
                    key={x.id}
                    todo={x}
                    onToggleDone={() => void t.toggleDone(x.id)}
                    onEdit={(d) => void t.update(x.id, d)}
                    onDelete={() => void t.softDelete(x.id)}
                    {...rowProps(x.id)}
                  />
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
