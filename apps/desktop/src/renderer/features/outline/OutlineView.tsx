import { useEffect, useMemo, useRef, useState } from "react";
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
 * 乐观本地 draft：`useWebdavStore.commit` 只在 WebDAV PUT resolve 后才
 * `setItems`，`store.outlines`（进而 `active.root`）落后一个网络往返。若
 * 直接把 `active.root` 传给 `OutlineTree`，用户在往返时间内连续两次操作
 * （如 Enter 新建节点后立刻 Tab 缩进）时，第二次操作会基于缺失第一次编辑的
 * 陈旧树计算，`outlineOps` 对不存在的 id 静默 no-op，随后整棵（缺失编辑
 * #1）的树被 PUT 上去，把编辑 #1 覆盖丢失。
 *
 * 修复：本地维护 `draft` root，每次编辑都同步更新它，`OutlineTree`/
 * `SourceMode` 一律读 `draft`（而不是网络滞后的 `active.root`），保证后续
 * 操作永远看到最新树。持久化仍走防抖/立即 `updateNodes`，只是屏幕真相源
 * 换成了本地 draft。
 *
 * 防抖用一个 `useRef` 定时器，每次调度前清掉上一个；`pendingRef` 记录待
 * flush 的持久化函数，在切换文档 / 组件卸载时主动 flush，避免 800ms 内的
 * 文本编辑被无声丢弃。
 */
export default function OutlineView(): React.ReactElement {
  const store = useOutlines();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draft, setDraft] = useState<OutlineNode[] | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<null | (() => void)>(null);
  const latestTitleRef = useRef<string | null>(null);

  const active: OutlineDoc | null = useMemo(
    () => store.outlines.find((d) => d.id === activeId) ?? store.outlines[0] ?? null,
    [store.outlines, activeId],
  );
  const currentActiveId = active?.id ?? null;

  // 仅在切换到另一份文档时重置 draft 和 titleDraft（依赖 currentActiveId，不是 active.root）——
  // 否则每次网络回包触发的 store.outlines 更新都会用滞后的 root 覆盖掉
  // 用户在等待期间已做的本地编辑。
  // 注意：若同一份已打开的文档在另一设备上被改动，本视图不会自动刷新，
  // 需要重新打开才能看到——这是文档级合并模型下的可接受权衡（MVP）。
  useEffect(() => {
    setDraft(active ? active.root : null);
    setTitleDraft(active ? active.title : null);
  }, [currentActiveId]); // 有意只依赖 currentActiveId，见上方注释

  // 保持 latestTitleRef 与 titleDraft 同步，以便在清理时读取最新标题。
  useEffect(() => {
    latestTitleRef.current = titleDraft;
  }, [titleDraft]);

  const flushPending = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingRef.current) {
      const fn = pendingRef.current;
      pendingRef.current = null;
      fn();
    }
  };

  // 切换文档 / 卸载组件时 flush 上一份文档尚未到期的防抖提交，以及未失焦的标题改动。
  useEffect(() => {
    const doc = active;
    return () => {
      flushPending();
      // 离开当前大纲前，提交未失焦的标题改动。
      const t = latestTitleRef.current;
      if (doc && t != null && t !== doc.title) {
        void store.renameDoc(doc.id, t);
      }
    };
  }, [currentActiveId]); // 依赖同上：仅在文档切换 / 卸载时 flush

  const treeRoot = draft ?? active?.root ?? [];

  const commitNodes = (docId: string, next: OutlineNode[], immediate?: boolean) => {
    setDraft(next); // 乐观本地更新：后续操作永远基于最新树，避免竞态覆盖
    const persist = () => {
      pendingRef.current = null;
      void store.updateNodes(docId, () => next);
    };
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (immediate) {
      persist();
    } else {
      pendingRef.current = persist;
      debounceRef.current = setTimeout(persist, 800);
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
                value={titleDraft ?? active.title}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft != null && titleDraft !== active.title) {
                    void store.renameDoc(active.id, titleDraft);
                  }
                }}
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
                root={treeRoot}
                onApply={(next) => {
                  setDraft(next); // 同步反映解析结果，不等 PUT 回包
                  void store.updateNodes(active.id, () => next);
                  setSourceMode(false);
                }}
                onCancel={() => setSourceMode(false)}
              />
            ) : (
              <OutlineTree
                key={active.id}
                root={treeRoot}
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
