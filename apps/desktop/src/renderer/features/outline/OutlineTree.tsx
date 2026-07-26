import { useRef, useState } from "react";
import OutlineNodeRow, { type NodeTitleHandlers } from "./OutlineNode";
import type { OutlineNode } from "./types";
import {
  visibleNodesInOrder,
  setText,
  setNote,
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

export interface OutlineTreeProps {
  root: OutlineNode[];
  onChange: (next: OutlineNode[], opts?: { immediate?: boolean }) => void;
  makeId: () => string;
}

const depthOf = (root: OutlineNode[], id: string, d = 0): number => {
  for (const n of root) {
    if (n.id === id) return d;
    const hit = depthOf(n.children, id, d + 1);
    if (hit >= 0) return hit;
  }
  return -1;
};

/** 顶层节点的父为 `null`，与 `dragMove` 的 `targetParentId=null` 语义一致。 */
function parentOf(root: OutlineNode[], id: string, parent: string | null = null): string | null {
  for (const n of root) {
    if (n.id === id) return parent;
    if (n.children.some((c) => c.id === id)) return n.id;
    const hit = parentOf(n.children, id, n.id);
    if (hit !== null) return hit;
  }
  return null;
}

/**
 * Renders the visible outline as a flat list of `OutlineNodeRow`s and owns
 * all keyboard/drag orchestration: focus + caret position, note-editing
 * state, and the drag source ref. Every handler here is a thin
 * transform-then-commit wrapper around the pure functions in `./outlineOps`
 * — this component holds no tree-shape logic of its own beyond depth/parent
 * lookups needed to translate UI events into `outlineOps` calls.
 *
 * Commit semantics: plain text edits (`onChange` from `NodeEditor`,
 * `onNoteChange`) call `props.onChange(next)` with no `immediate` flag so the
 * parent can debounce them; every structural op (Enter/Tab/merge/move/
 * collapse/drag/note-blur) passes `{ immediate: true }` so it lands right
 * away.
 */
export default function OutlineTree(props: OutlineTreeProps): React.ReactElement {
  const { root } = props;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [caret, setCaret] = useState<"start" | "end">("end");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const visible = visibleNodesInOrder(root);
  const focusTitle = (id: string, c: "start" | "end" = "end") => {
    setCaret(c);
    setFocusedId(id);
  };
  const focusRelative = (id: string, delta: -1 | 1, c: "start" | "end") => {
    const i = visible.findIndex((n) => n.id === id);
    const target = visible[i + delta];
    if (target) focusTitle(target.id, c);
  };

  const handlersFor = (id: string): NodeTitleHandlers => ({
    onChange: (md) => props.onChange(setText(root, id, md)), // 文本：防抖提交（父层判定）
    onEnter: (before, after) => {
      const newId = props.makeId();
      let next = setText(root, id, before);
      next = insertSiblingAfter(next, id, { id: newId, text: after, collapsed: false, children: [] });
      props.onChange(next, { immediate: true });
      focusTitle(newId, "start");
    },
    onIndent: () => {
      props.onChange(indent(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onOutdent: () => {
      props.onChange(outdent(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onMergeBackspace: () => {
      const r = mergeDelete(root, id);
      props.onChange(r.root, { immediate: true });
      if (r.focusId) focusTitle(r.focusId, "end");
    },
    onMoveUp: () => {
      props.onChange(moveUp(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onMoveDown: () => {
      props.onChange(moveDown(root, id), { immediate: true });
      focusTitle(id, "end");
    },
    onToggleCollapse: () => props.onChange(toggleCollapse(root, id), { immediate: true }),
    onFocusPrev: () => focusRelative(id, -1, "end"),
    onFocusNext: () => focusRelative(id, 1, "start"),
    onBlur: (md) => {
      props.onChange(setText(root, id, md), { immediate: true });
      setFocusedId((cur) => (cur === id ? null : cur));
    },
  });

  return (
    <div className="ol-tree">
      {visible.map((node) => (
        <OutlineNodeRow
          key={node.id}
          node={node}
          depth={depthOf(root, node.id)}
          focused={focusedId === node.id}
          caret={caret}
          editingNote={editingNoteId === node.id}
          onFocusTitle={focusTitle}
          onToggleCollapse={(id) => props.onChange(toggleCollapse(root, id), { immediate: true })}
          handlers={handlersFor(node.id)}
          onEditNote={(id) => setEditingNoteId(id)}
          onNoteChange={(id, md) => props.onChange(setNote(root, id, md))}
          onNoteBlur={(id, md) => {
            props.onChange(setNote(root, id, md), { immediate: true });
            setEditingNoteId((cur) => (cur === id ? null : cur));
          }}
          onDragStart={(id) => (dragId.current = id)}
          onDropOn={(targetId, position) => {
            const src = dragId.current;
            dragId.current = null;
            if (!src || src === targetId) return;
            if (position === "child") {
              props.onChange(dragMove(root, src, targetId, 0), { immediate: true });
            } else {
              // before：放到 target 同层、target 之前
              const parentId = parentOf(root, targetId);
              const siblings = parentId ? findNode(root, parentId)!.children : root;
              const srcIdx = siblings.findIndex((n) => n.id === src);
              const rawIdx = siblings.findIndex((n) => n.id === targetId);
              // dragMove removes src before splicing; if src was before target in the same
              // parent, target's index shifts down by one after removal — compensate.
              const idx = srcIdx !== -1 && srcIdx < rawIdx ? rawIdx - 1 : rawIdx;
              props.onChange(dragMove(root, src, parentId, Math.max(0, idx)), { immediate: true });
            }
          }}
        />
      ))}
      {/* 末尾空白点击 → 在末节点后新建 */}
      <div
        className="ol-tail"
        onClick={() => {
          const last = visible[visible.length - 1];
          const newId = props.makeId();
          const anchor = last ? last.id : null;
          if (anchor) {
            props.onChange(
              insertSiblingAfter(root, anchor, { id: newId, text: "", collapsed: false, children: [] }),
              { immediate: true },
            );
          } else {
            props.onChange([{ id: newId, text: "", collapsed: false, children: [] }], { immediate: true });
          }
          focusTitle(newId, "start");
        }}
      />
    </div>
  );
}
