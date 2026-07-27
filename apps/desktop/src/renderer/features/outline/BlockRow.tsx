import { useEffect, useRef, useState } from "react";
import { OIcon } from "../../components/outlineIcons";
import MarkdownRenderer from "../../lib/markdown/renderer";
import { parsePastedOutline } from "./outlineSerialize";
import { headingLevel } from "./types";
import type { Block } from "./types";

/** 转发给聚焦行 textarea 的按键/编辑回调（由调用方绑定到具体 block.id）。 */
export interface BlockKeyHandlers {
  onChange: (text: string) => void;
  onEnter: (before: string, after: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMergeBackspace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onBlur: (text: string) => void;
  onPasteOutline: (pasted: Block[], before: string, after: string) => void;
}

export interface BlockRowProps {
  block: Block;
  depth: number;
  focused: boolean;
  caret: "start" | "end";
  onFocusBlock: (id: string, caret?: "start" | "end") => void;
  onToggleCollapse: (id: string) => void;
  onZoom: (id: string) => void;
  handlers: BlockKeyHandlers;
  onDragStart: (id: string) => void;
  onDropOn: (id: string, position: "before" | "child") => void;
}

/** textarea 高度随内容自增（无滚动条）。 */
function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * 一行块：折叠三角 + 圆点（点击 zoom）+ 正文（聚焦时是原始 markdown
 * textarea，失焦时是渲染后的 MarkdownRenderer）。同时承担本行的 HTML5
 * 拖拽收放（draggable + onDragOver 算 before/child 提示）。
 */
export default function BlockRow(props: BlockRowProps): React.ReactElement {
  const { block, depth, focused } = props;
  const [dropHint, setDropHint] = useState<"before" | "child" | null>(null);
  const hasChildren = block.children.length > 0;
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 聚焦时：定位光标到 start/end，并按内容自增高度。仅在挂载/聚焦切换时跑一次，
  // 不在每次输入后重跑（textarea 是非受控的，自己拥有编辑状态）。
  useEffect(() => {
    if (!focused) return;
    const el = taRef.current;
    if (!el) return;
    el.focus();
    const pos = props.caret === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    autoGrow(el);
    // 仅在聚焦态或块切换时定位光标；故意不依赖 props.caret 之外的值。
  }, [focused, block.id]);

  const hLevel = headingLevel(block.text);

  return (
    <div
      className="ol-row"
      data-block-id={block.id}
      data-h={hLevel || undefined}
      style={{ paddingLeft: depth * 24 }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(block.id);
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
        if (dropHint) props.onDropOn(block.id, dropHint);
        setDropHint(null);
      }}
      data-drop={dropHint ?? undefined}
    >
      <div className="ol-row-main">
        <button
          className="ol-caret"
          aria-label={block.collapsed ? "展开" : "折叠"}
          onClick={() => props.onToggleCollapse(block.id)}
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          <OIcon name={block.collapsed ? "collapsed" : "caretUp"} size={14} />
        </button>
        <span
          className={`ol-bullet ${block.collapsed && hasChildren ? "has-hidden" : ""}`}
          onClick={() => props.onZoom(block.id)}
        />
        {focused ? (
          <textarea
            ref={taRef}
            className="ol-block-input"
            rows={1}
            defaultValue={block.text}
            onChange={(e) => {
              autoGrow(e.currentTarget);
              props.handlers.onChange(e.currentTarget.value);
            }}
            onBlur={(e) => props.handlers.onBlur(e.currentTarget.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text/plain");
              if (!text.includes("\n")) return; // 单行粘贴：走默认插入
              e.preventDefault();
              const ta = e.currentTarget;
              const before = ta.value.slice(0, ta.selectionStart);
              const after = ta.value.slice(ta.selectionEnd);
              const pasted = parsePastedOutline(text);
              props.handlers.onPasteOutline(pasted, before, after);
            }}
            onKeyDown={(e) => {
              const ta = e.currentTarget;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const before = ta.value.slice(0, ta.selectionStart);
                const after = ta.value.slice(ta.selectionEnd);
                props.handlers.onEnter(before, after);
                return;
              }
              if (e.key === "Tab") {
                e.preventDefault();
                if (e.shiftKey) props.handlers.onOutdent();
                else props.handlers.onIndent();
                return;
              }
              if (e.key === "Backspace" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
                e.preventDefault();
                props.handlers.onMergeBackspace();
                return;
              }
              if (e.altKey && e.key === "ArrowUp") {
                e.preventDefault();
                props.handlers.onMoveUp();
                return;
              }
              if (e.altKey && e.key === "ArrowDown") {
                e.preventDefault();
                props.handlers.onMoveDown();
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key === ".") {
                e.preventDefault();
                props.handlers.onToggleCollapse();
                return;
              }
              if (e.key === "ArrowUp") {
                const beforeCaret = ta.value.slice(0, ta.selectionStart);
                if (!beforeCaret.includes("\n")) {
                  e.preventDefault();
                  props.handlers.onFocusPrev();
                }
                return;
              }
              if (e.key === "ArrowDown") {
                const afterCaret = ta.value.slice(ta.selectionEnd);
                if (!afterCaret.includes("\n")) {
                  e.preventDefault();
                  props.handlers.onFocusNext();
                }
                return;
              }
            }}
          />
        ) : (
          <div className="ol-block-render" onClick={() => props.onFocusBlock(block.id, "end")}>
            <MarkdownRenderer content={block.text || " "} breaks />
          </div>
        )}
      </div>
    </div>
  );
}
