import { useEffect, useMemo, useRef, useState } from "react";
import { usePages } from "./usePages";
import BlockTree from "./BlockTree";
import { makeBlockId } from "./types";
import type { Block, Page } from "./types";
import "./OutlineView.css";

/** 面包屑上一段块摘要的最大字符数。 */
const CRUMB_SNIPPET_LEN = 40;

/** 把块正文粗略地去掉最常见的 markdown 标记，取前 N 个字符作为面包屑摘要。 */
function crumbSnippet(text: string): string {
  const plain = text
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`~]/g, "")
    .replace(/^[-*+]\s+/, "")
    .trim();
  const firstLine = plain.split("\n")[0] ?? "";
  return firstLine.length > CRUMB_SNIPPET_LEN
    ? `${firstLine.slice(0, CRUMB_SNIPPET_LEN)}…`
    : firstLine || "(空块)";
}

/** 从 root 走到目标块，返回沿途祖先链（不含 root 本身，含目标块）。找不到则空数组。 */
function ancestorPath(root: Block[], targetId: string): Block[] {
  const path: Block[] = [];
  const walk = (nodes: Block[]): boolean => {
    for (const node of nodes) {
      path.push(node);
      if (node.id === targetId) return true;
      if (walk(node.children)) return true;
      path.pop();
    }
    return false;
  };
  walk(root);
  return path;
}

/**
 * `/outline` 路由页：左列页面列表（新建/选择/重命名/删除/置顶），右列 zoom 面包屑
 * （聚焦某块时显示）+ `BlockTree`。
 *
 * 乐观本地 draft + 防抖提交：`useWebdavStore.commit` 只在 WebDAV PUT resolve 后才
 * `setItems`，`store.pages`（进而 `active.root`）落后一个网络往返。若直接把
 * `active.root` 传给 `BlockTree`，用户在往返时间内连续两次操作（如 Enter 新建块后
 * 立刻 Tab 缩进）时，第二次操作会基于缺失第一次编辑的陈旧树计算，随后整棵（缺失
 * 编辑 #1）的树被 PUT 上去，把编辑 #1 覆盖丢失。
 *
 * 修复（沿用旧 OutlineView 的写法）：本地维护 `draft` root，每次编辑都同步更新它，
 * `BlockTree` 一律读 `draft`（而不是网络滞后的 `active.root`），保证后续操作永远
 * 看到最新树。持久化仍走防抖/立即 `updateBlocks`，只是屏幕真相源换成了本地 draft。
 *
 * 防抖用一个 `useRef` 定时器，每次调度前清掉上一个；`pendingRef` 记录待 flush 的
 * 持久化函数，在切换页面 / 组件卸载时主动 flush，避免 700ms 内的文本编辑被无声丢弃。
 *
 * zoom：`zoomedBlockId` 由本组件持有，切页时重置为 null；面包屑通过在 `treeRoot`
 * 里走一次祖先路径（`ancestorPath`）现算，不额外持久化。
 */
export default function OutlineView(): React.ReactElement {
  const store = usePages();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Block[] | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [zoomedBlockId, setZoomedBlockId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<null | (() => void)>(null);
  const latestTitleRef = useRef<string | null>(null);

  const active: Page | null = useMemo(
    () => store.pages.find((p) => p.id === activeId) ?? store.pages[0] ?? null,
    [store.pages, activeId],
  );
  const currentActiveId = active?.id ?? null;

  // 仅在切换到另一份页面时重置 draft / titleDraft / zoom（依赖 currentActiveId，
  // 不是 active.root）——否则每次网络回包触发的 store.pages 更新都会用滞后的 root
  // 覆盖掉用户在等待期间已做的本地编辑。
  useEffect(() => {
    setDraft(active ? active.root : null);
    setTitleDraft(active ? active.title : null);
    setZoomedBlockId(null);
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

  // 切换页面 / 卸载组件时 flush 上一份页面尚未到期的防抖提交，以及未失焦的标题改动。
  useEffect(() => {
    const page = active;
    return () => {
      flushPending();
      // 离开当前页面前，提交未失焦的标题改动。
      const t = latestTitleRef.current;
      if (page && t != null && t !== page.title) {
        void store.renamePage(page.id, t);
      }
    };
  }, [currentActiveId]); // 依赖同上：仅在页面切换 / 卸载时 flush

  const treeRoot = draft ?? active?.root ?? [];

  const commitBlocks = (pageId: string, next: Block[], immediate?: boolean) => {
    setDraft(next); // 乐观本地更新：后续操作永远基于最新树，避免竞态覆盖
    const persist = () => {
      pendingRef.current = null;
      void store.updateBlocks(pageId, () => next);
    };
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (immediate) {
      persist();
    } else {
      pendingRef.current = persist;
      debounceRef.current = setTimeout(persist, 700);
    }
  };

  const zoomTrail = zoomedBlockId ? ancestorPath(treeRoot, zoomedBlockId) : [];

  if (store.loading && store.pages.length === 0) {
    return <div className="ol-view ol-empty">正在加载大纲…</div>;
  }

  return (
    <div className="ol-view">
      <aside className="ol-doclist">
        <div className="ol-doclist-head">
          <span>大纲</span>
          <button
            onClick={async () => {
              const id = await store.addPage("未命名大纲");
              setActiveId(id);
              setZoomedBlockId(null);
            }}
          >
            ＋新建
          </button>
        </div>
        {store.pages.map((p) => (
          <div
            key={p.id}
            className={`ol-doc-item ${active?.id === p.id ? "active" : ""}`}
            onClick={() => {
              setActiveId(p.id);
              setZoomedBlockId(null);
            }}
          >
            <span className="ol-doc-title">
              {p.pinned && "📌 "}
              {p.title}
            </span>
            <button
              className="ol-doc-pin"
              title={p.pinned ? "取消置顶" : "置顶"}
              onClick={(e) => {
                e.stopPropagation();
                void store.togglePin(p.id);
              }}
            >
              {p.pinned ? "★" : "☆"}
            </button>
            <button
              className="ol-doc-del"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                void store.removePage(p.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {store.pages.length === 0 && <div className="ol-empty">还没有大纲，点「新建」开始。</div>}
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
                    void store.renamePage(active.id, titleDraft);
                  }
                }}
              />
            </div>

            {zoomedBlockId && (
              <div className="ol-breadcrumb">
                <span className="ol-crumb" onClick={() => setZoomedBlockId(null)}>
                  {active.title}
                </span>
                {zoomTrail.map((block, i) => {
                  const isLast = i === zoomTrail.length - 1;
                  return (
                    <span key={block.id}>
                      <span className="ol-crumb-sep">›</span>
                      <span
                        className={`ol-crumb ${isLast ? "ol-crumb-current" : ""}`}
                        onClick={() => setZoomedBlockId(block.id)}
                      >
                        {crumbSnippet(block.text)}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            <BlockTree
              key={active.id}
              root={treeRoot}
              rootBlockId={zoomedBlockId}
              onChange={(next, opts) => commitBlocks(active.id, next, opts?.immediate)}
              makeId={() => makeBlockId(Date.now(), Math.random())}
              onZoom={setZoomedBlockId}
            />
          </>
        )}
      </main>
    </div>
  );
}
