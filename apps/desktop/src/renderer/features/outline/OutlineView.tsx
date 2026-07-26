import { useMemo, useRef, useState } from "react";
import { useOutlines } from "./useOutlines";
import OutlineTree from "./OutlineTree";
import SourceMode from "./SourceMode";
import ExportDialog from "./ExportDialog";
import { makeNodeId } from "./types";
import type { OutlineNode, OutlineDoc } from "./types";
import "./OutlineView.css";

/**
 * `/outline` 路由页：左列文档列表（新建/选择/重命名/删除/置顶），右列工具栏
 * （标题/大纲·源码切换/导出）+ 树或源码编辑区。
 *
 * 提交编排：`OutlineTree` 的结构类操作（Enter/Tab/拖拽/折叠等）带
 * `{ immediate: true }`，立即 `updateNodes`；纯文本编辑（标题/备注逐字输入）
 * 不带该 flag，这里防抖 800ms 后才提交，避免每次按键都写 WebDAV。
 *
 * 防抖用一个 `useRef` 定时器，每次调度前清掉上一个 —— 由于闭包捕获的是
 * "调度那一刻" 的 `docId`/`next`（而不是渲染时的最新值），即便用户在等待
 * 窗口内切换到另一份文档，这次延迟提交仍然精准落在原文档上，不会串写。
 * 代价：切换文档或卸载组件时，若正好有一次未到期的防抖提交，它不会被
 * flush 或 cancel —— 800ms 后仍会照常写入它捕获的那份文档。这是可接受的
 * （数据不丢、目标不错），但如果用户期望「离开即保存」的即时反馈，这里
 * 有最多 800ms 的可见延迟，暂未在离开时主动 flush。
 */
export default function OutlineView(): React.ReactElement {
  const store = useOutlines();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active: OutlineDoc | null = useMemo(
    () => store.outlines.find((d) => d.id === activeId) ?? store.outlines[0] ?? null,
    [store.outlines, activeId],
  );

  const commitNodes = (docId: string, next: OutlineNode[], immediate?: boolean) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) {
      void store.updateNodes(docId, () => next);
    } else {
      debounceRef.current = setTimeout(() => void store.updateNodes(docId, () => next), 800);
    }
  };

  if (store.loading && store.outlines.length === 0) {
    return <div className="ol-view ol-empty">正在加载大纲…</div>;
  }

  return (
    <div className="ol-view">
      <aside className="ol-doclist">
        <div className="ol-doclist-head">
          <span>大纲</span>
          <button
            onClick={async () => {
              const id = await store.addDoc("未命名大纲");
              setActiveId(id);
              setSourceMode(false);
            }}
          >
            ＋新建
          </button>
        </div>
        {store.outlines.map((d) => (
          <div
            key={d.id}
            className={`ol-doc-item ${active?.id === d.id ? "active" : ""}`}
            onClick={() => {
              setActiveId(d.id);
              setSourceMode(false);
            }}
          >
            <span className="ol-doc-title">
              {d.pinned && "📌 "}
              {d.title}
            </span>
            <button
              className="ol-doc-pin"
              title={d.pinned ? "取消置顶" : "置顶"}
              onClick={(e) => {
                e.stopPropagation();
                void store.togglePin(d.id);
              }}
            >
              {d.pinned ? "★" : "☆"}
            </button>
            <button
              className="ol-doc-del"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                void store.removeDoc(d.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {store.outlines.length === 0 && <div className="ol-empty">还没有大纲，点「新建」开始。</div>}
      </aside>

      <main className="ol-main">
        {!active ? (
          <div className="ol-empty">选择或新建一份大纲</div>
        ) : (
          <>
            <div className="ol-toolbar">
              <input
                className="ol-doc-name"
                value={active.title}
                onChange={(e) => void store.renameDoc(active.id, e.target.value)}
              />
              <div className="ol-toolbar-actions">
                <button className={sourceMode ? "" : "active"} onClick={() => setSourceMode(false)}>
                  大纲
                </button>
                <button className={sourceMode ? "active" : ""} onClick={() => setSourceMode(true)}>
                  源码
                </button>
                <button onClick={() => setExporting(true)}>导出到 Outline</button>
              </div>
            </div>

            {sourceMode ? (
              <SourceMode
                root={active.root}
                onApply={(next) => {
                  void store.updateNodes(active.id, () => next);
                  setSourceMode(false);
                }}
                onCancel={() => setSourceMode(false)}
              />
            ) : (
              <OutlineTree
                key={active.id}
                root={active.root}
                makeId={() => makeNodeId(Date.now(), Math.random())}
                onChange={(next, opts) => commitNodes(active.id, next, opts?.immediate)}
              />
            )}
          </>
        )}
      </main>

      {exporting && active && <ExportDialog doc={active} onClose={() => setExporting(false)} />}
    </div>
  );
}
