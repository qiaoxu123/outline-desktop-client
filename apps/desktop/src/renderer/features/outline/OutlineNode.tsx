import { useState } from "react";
import { OIcon } from "../../components/outlineIcons";
import MarkdownRenderer, { renderInlineMarkdown } from "../../lib/markdown/renderer";
import NodeEditor from "./NodeEditor";
import type { OutlineNode } from "./types";

/** Per-node callbacks forwarded to the focused row's `NodeEditor` (already bound to `node.id` by the caller). */
export interface NodeTitleHandlers {
  onChange: (md: string) => void;
  onEnter: (before: string, after: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMergeBackspace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onBlur: (md: string) => void;
}

export interface OutlineNodeRowProps {
  node: OutlineNode;
  depth: number;
  focused: boolean;
  caret: "start" | "end";
  editingNote: boolean;
  onFocusTitle: (id: string, caret?: "start" | "end") => void;
  onToggleCollapse: (id: string) => void;
  handlers: NodeTitleHandlers;
  onEditNote: (id: string) => void;
  onNoteChange: (id: string, md: string) => void;
  onNoteBlur: (id: string, md: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string, position: "before" | "child") => void;
}

/**
 * One outline row: collapse caret + bullet + title (NodeEditor when focused,
 * static inline markdown otherwise) + optional note (textarea when editing,
 * MarkdownRenderer otherwise). Also owns this row's HTML5 drag-and-drop
 * plumbing — draggable + onDragOver computing a before/child drop hint.
 */
export default function OutlineNodeRow(props: OutlineNodeRowProps): React.ReactElement {
  const { node, depth, focused, editingNote } = props;
  const [dropHint, setDropHint] = useState<"before" | "child" | null>(null);
  const hasChildren = node.children.length > 0;

  return (
    <div
      className="ol-row"
      style={{ paddingLeft: depth * 22 }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(node.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        // 上半 → before，下半 → child（缩进为其子）
        const r = e.currentTarget.getBoundingClientRect();
        setDropHint(e.clientY - r.top < r.height / 2 ? "before" : "child");
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropHint) props.onDropOn(node.id, dropHint);
        setDropHint(null);
      }}
      data-drop={dropHint ?? undefined}
    >
      <div className="ol-row-main">
        <button
          className="ol-caret"
          aria-label={node.collapsed ? "展开" : "折叠"}
          onClick={() => props.onToggleCollapse(node.id)}
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          <OIcon name={node.collapsed ? "collapsed" : "caretUp"} size={14} />
        </button>
        <span className={`ol-bullet ${node.collapsed && hasChildren ? "has-hidden" : ""}`} />
        {focused ? (
          <NodeEditor
            initialMarkdown={node.text}
            autoFocusCaret={props.caret}
            onChange={props.handlers.onChange}
            onEnter={props.handlers.onEnter}
            onIndent={props.handlers.onIndent}
            onOutdent={props.handlers.onOutdent}
            onMergeBackspace={props.handlers.onMergeBackspace}
            onMoveUp={props.handlers.onMoveUp}
            onMoveDown={props.handlers.onMoveDown}
            onToggleCollapse={props.handlers.onToggleCollapse}
            onFocusPrev={props.handlers.onFocusPrev}
            onFocusNext={props.handlers.onFocusNext}
            onBlur={props.handlers.onBlur}
          />
        ) : (
          <div
            className="ol-title"
            onClick={() => props.onFocusTitle(node.id, "end")}
            dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(node.text) || "&nbsp;" }}
          />
        )}
      </div>

      {node.note !== undefined &&
        (editingNote ? (
          <textarea
            className="ol-note-edit"
            autoFocus
            defaultValue={node.note}
            onChange={(e) => props.onNoteChange(node.id, e.target.value)}
            onBlur={(e) => props.onNoteBlur(node.id, e.target.value)}
          />
        ) : (
          <div className="ol-note" onClick={() => props.onEditNote(node.id)}>
            <MarkdownRenderer content={node.note || "（空备注）"} breaks />
          </div>
        ))}
    </div>
  );
}
