import { useEffect, useRef, useState } from "react";
import BlockRow, { type BlockKeyHandlers } from "./BlockRow";
import type { Block } from "./types";
import {
  visibleNodesInOrder,
  setText,
  toggleCollapse,
  insertSiblingAfter,
  indent,
  outdent,
  moveUp,
  moveDown,
  mergeDelete,
  dragMove,
  findNode,
} from "./outlineOps";

export interface BlockTreeProps {
  root: Block[];
  /** zoom 根：非空时只渲染该块子树，null/undefined = 整页。 */
  rootBlockId?: string | null;
  onChange: (next: Block[], opts?: { immediate?: boolean }) => void;
  makeId: () => string;
  /** zoom 由父层（OutlineView）持有状态，这里只负责把 bullet 点击事件透传出去。 */
  onZoom?: (id: string) => void;
}

const depthOf = (nodes: Block[], id: string, d = 0): number => {
  for (const n of nodes) {
    if (n.id === id) return d;
    const hit = depthOf(n.children, id, d + 1);
    if (hit >= 0) return hit;
  }
  return -1;
};

/** 顶层节点的父为 `null`，与 `dragMove` 的 `targetParentId=null` 语义一致。 */
function parentOf(root: Block[], id: string, parent: string | null = null): string | null {
  for (const n of root) {
    if (n.id === id) return parent;
    if (n.children.some((c) => c.id === id)) return n.id;
    const hit = parentOf(n.children, id, n.id);
    if (hit !== null) return hit;
  }
  return null;
}

/** 把新块追加为 parentId 的第一个子节点（zoom 根本身没有可见兄弟可挂靠时用）。 */
function appendChild(root: Block[], parentId: string, block: Block): Block[] {
  return root.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, block] };
    if (n.children.length === 0) return n;
    const next = appendChild(n.children, parentId, block);
    return next === n.children ? n : { ...n, children: next };
  });
}

/**
 * 把可见块渲染成一列 `BlockRow`，并承担全部键盘/拖拽编排：聚焦块 + 光标位置、
 * 拖拽源 ref。这里的每个 handler 都是「变换后提交」的薄封装，包在
 * `./outlineOps` 的纯函数外面——本组件自身不持有树形结构逻辑，除了把 UI
 * 事件翻译成 outlineOps 调用所需的 depth/parent 查找。
 *
 * 提交语义：纯文本编辑（`onChange`）不带 `immediate`，交给父层防抖；结构类操作
 * （Enter/Tab/合并/移动/折叠/拖拽/粘贴）都带 `{ immediate: true }`，立刻落盘。
 *
 * zoom：`rootBlockId` 只影响“渲染哪些块”（子树而非整页），所有 outlineOps
 * 变换仍然作用在完整的 `root` 上，保证 zoom 进出时数据一致。
 */
export default function BlockTree(props: BlockTreeProps): React.ReactElement {
  const { root, rootBlockId } = props;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [caret, setCaret] = useState<"start" | "end">("end");
  const dragId = useRef<string | null>(null);

  // 性能关键：BlockRow 用 React.memo 忽略回调 identity，只在 block/depth/focused/caret
  // 变化时重渲染。为此失焦行会保留“上一次渲染的回调闭包”——这些闭包必须读最新的树，
  // 否则会用陈旧 root 操作。用稳定的 rootRef 让任何闭包都读到当前 root。
  // （键盘类 handler 只会在“当前聚焦行”触发，而聚焦行总是新渲染，故本就不陈旧；
  //  真正需要 rootRef 的是失焦行也可能触发的 折叠/拖拽 回调。）
  const rootRef = useRef(root);
  rootRef.current = root;

  const zoomBlock = rootBlockId ? findNode(root, rootBlockId) : null;
  const baseNodes = rootBlockId ? (zoomBlock ? zoomBlock.children : []) : root;
  const visible = visibleNodesInOrder(baseNodes);

  const focusBlock = (id: string, c: "start" | "end" = "end") => {
    setCaret(c);
    setFocusedId(id);
  };

  // 打开页面（每页 key 重挂载）时自动聚焦第一个可见块，给出即时可打字的光标——
  // 否则空块/未聚焦时页面无光标，用户会以为不能输入。用 ref 守卫：在“可见块就绪
  // 且当前无聚焦”的首个渲染触发一次（pages 异步加载完成前 visible 可能为空，故
  // 不能用挂载即跑的 [] 依赖）。
  const didAutoFocus = useRef(false);
  useEffect(() => {
    if (!didAutoFocus.current && focusedId === null && visible.length > 0) {
      didAutoFocus.current = true;
      setCaret("end");
      setFocusedId(visible[0].id);
    }
  });
  const focusRelative = (id: string, delta: -1 | 1, c: "start" | "end") => {
    const r = rootRef.current;
    const base = rootBlockId ? (findNode(r, rootBlockId)?.children ?? []) : r;
    const vis = visibleNodesInOrder(base);
    const i = vis.findIndex((n) => n.id === id);
    const target = vis[i + delta];
    if (target) focusBlock(target.id, c);
  };

  const handlersFor = (id: string): BlockKeyHandlers => ({
    onChange: (text) => props.onChange(setText(rootRef.current, id, text)), // 文本：防抖提交（父层判定）
    onEnter: (before, after) => {
      const newId = props.makeId();
      let next = setText(rootRef.current, id, before);
      next = insertSiblingAfter(next, id, { id: newId, text: after, collapsed: false, children: [] });
      props.onChange(next, { immediate: true });
      focusBlock(newId, "start");
    },
    onIndent: () => {
      props.onChange(indent(rootRef.current, id), { immediate: true });
      focusBlock(id, "end");
    },
    onOutdent: () => {
      props.onChange(outdent(rootRef.current, id), { immediate: true });
      focusBlock(id, "end");
    },
    onMergeBackspace: () => {
      const r = mergeDelete(rootRef.current, id);
      props.onChange(r.root, { immediate: true });
      if (r.focusId) focusBlock(r.focusId, "end");
    },
    onMoveUp: () => {
      props.onChange(moveUp(rootRef.current, id), { immediate: true });
      focusBlock(id, "end");
    },
    onMoveDown: () => {
      props.onChange(moveDown(rootRef.current, id), { immediate: true });
      focusBlock(id, "end");
    },
    onToggleCollapse: () => props.onChange(toggleCollapse(rootRef.current, id), { immediate: true }),
    onFocusPrev: () => focusRelative(id, -1, "end"),
    onFocusNext: () => focusRelative(id, 1, "start"),
    onBlur: (text) => {
      props.onChange(setText(rootRef.current, id, text), { immediate: true });
      setFocusedId((cur) => (cur === id ? null : cur));
    },
    onPasteOutline: (pasted, before, after) => {
      let next = setText(rootRef.current, id, before);
      let anchor = id;
      for (const p of pasted) {
        next = insertSiblingAfter(next, anchor, p);
        anchor = p.id;
      }
      if (after.length > 0 || pasted.length === 0) {
        const newId = props.makeId();
        next = insertSiblingAfter(next, anchor, { id: newId, text: after, collapsed: false, children: [] });
        props.onChange(next, { immediate: true });
        focusBlock(newId, "start");
      } else {
        props.onChange(next, { immediate: true });
        focusBlock(anchor, "end");
      }
    },
  });

  return (
    <div className="ol-tree">
      {visible.map((block) => (
        <BlockRow
          key={block.id}
          block={block}
          depth={depthOf(baseNodes, block.id)}
          focused={focusedId === block.id}
          caret={caret}
          onFocusBlock={focusBlock}
          onToggleCollapse={(id) => props.onChange(toggleCollapse(rootRef.current, id), { immediate: true })}
          onZoom={(id) => props.onZoom?.(id)}
          handlers={handlersFor(block.id)}
          onDragStart={(id) => (dragId.current = id)}
          onDropOn={(targetId, position) => {
            const r = rootRef.current;
            const src = dragId.current;
            dragId.current = null;
            if (!src || src === targetId) return;
            if (position === "child") {
              props.onChange(dragMove(r, src, targetId, 0), { immediate: true });
            } else {
              // before：放到 target 同层、target 之前
              const parentId = parentOf(r, targetId);
              const siblings = parentId ? findNode(r, parentId)!.children : r;
              const srcIdx = siblings.findIndex((n) => n.id === src);
              const rawIdx = siblings.findIndex((n) => n.id === targetId);
              // dragMove removes src before splicing; if src was before target in the same
              // parent, target's index shifts down by one after removal — compensate.
              const idx = srcIdx !== -1 && srcIdx < rawIdx ? rawIdx - 1 : rawIdx;
              props.onChange(dragMove(r, src, parentId, Math.max(0, idx)), { immediate: true });
            }
          }}
        />
      ))}
      {/* 末尾空白点击 → 在末块后新建（zoom 中若子树为空则挂到 zoom 根下） */}
      <div
        className="ol-tail"
        onClick={() => {
          const last = visible[visible.length - 1];
          const newId = props.makeId();
          const newBlock = { id: newId, text: "", collapsed: false, children: [] };
          if (last) {
            props.onChange(insertSiblingAfter(root, last.id, newBlock), { immediate: true });
          } else if (rootBlockId && zoomBlock) {
            props.onChange(appendChild(root, rootBlockId, newBlock), { immediate: true });
          } else {
            props.onChange([newBlock], { immediate: true });
          }
          focusBlock(newId, "start");
        }}
      />
    </div>
  );
}
