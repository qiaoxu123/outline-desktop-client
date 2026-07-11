import { useState } from "react";
import {
  useEditor,
  EditorContent,
  BubbleMenu,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { MathInline, MathBlock } from "./extensions/math";
import { CommentHighlights } from "./extensions/commentHighlights";
import { AttachmentImage } from "./extensions/image";
import "katex/dist/katex.min.css";
import "./Editor.css";

/**
 * Highlight serialized to `==text==` for markdown round-trip (the read view
 * renders it via markdown-it-mark). Without this, tiptap-markdown falls back
 * to emitting `<mark>` HTML, which our html:false renderer wouldn't show.
 */
const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        // Markdown only encodes "highlighted" (==), not the specific color —
        // this matches Outline's own markdown export. The chosen color shows
        // live in the editor; on reload via markdown it falls back to default.
        serialize: { open: "==", close: "==", expelEnclosingWhitespace: true },
        parse: {},
      },
    };
  },
}).configure({ multicolor: true });

/**
 * With Table resizable:false prosemirror-tables renders a bare <table>; wide
 * tables then overflow the reading column. Wrapping in a scroll container
 * (like Outline web's .tableWrapper) only changes the DOM, not the markdown.
 */
const ScrollableTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "tableWrapper" },
      ["table", HTMLAttributes, ["tbody", 0]],
    ];
  },
}).configure({ resizable: false });

/**
 * In-place rich text editor — TipTap (ProseMirror, the same engine Outline
 * uses) with two-way markdown conversion. The content area looks identical
 * to the read view; you simply start typing.
 */
export function useMarkdownEditor(
  initialMarkdown: string,
  editable: boolean,
  onCommentClick?: (commentId: string) => void,
): TiptapEditor | null {
  // Created once per component mount (callers remount via key per document) —
  // recreating on every content/prop change would reset the cursor mid-typing.
  return useEditor(
    {
      editable,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        AttachmentImage,
        TaskList,
        TaskItem.configure({ nested: true }),
        ScrollableTable,
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({ placeholder: "开始编写…" }),
        MarkdownHighlight,
        MathInline,
        MathBlock,
        CommentHighlights.configure({ onCommentClick }),
        Markdown.configure({
          html: false,
          linkify: true,
          breaks: false,
          transformPastedText: true,
        }),
      ],
      content: initialMarkdown,
    },
    [],
  );
}

export function getMarkdown(editor: TiptapEditor): string {
  return (
    editor.storage as { markdown?: { getMarkdown: () => string } }
  ).markdown!.getMarkdown();
}

/* Outline's 6 highlight preset colors (shared/utils/color.ts). */
const HIGHLIGHT_COLORS: { hex: string; name: string }[] = [
  { hex: "#FDEA9B", name: "珊瑚黄" },
  { hex: "#FED46A", name: "杏橙" },
  { hex: "#FA551E", name: "落日橙" },
  { hex: "#B4DC19", name: "青柠" },
  { hex: "#C8AFF0", name: "泡泡紫" },
  { hex: "#3CBEFC", name: "霓虹蓝" },
];

/* ---------- selection toolbar (bubble menu) ---------- */

/** 18px icon on the 24-unit Material grid (matches Outline web's icon look). */
function Icon({ d }: { d: string }): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  quote: "M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z",
  bulletList:
    "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z",
  orderedList:
    "M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z",
  todoList:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99 8-8z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  comment:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z",
  clear:
    "M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.55 5.27 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z",
} as const;

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`bubble-btn ${active ? "active" : ""}`}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function HighlightControl({
  editor,
}: {
  editor: TiptapEditor;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const active = editor.isActive("highlight");

  return (
    <span className="bubble-hl-wrap">
      <button
        type="button"
        className={`bubble-btn ${active ? "active" : ""}`}
        title="高亮"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <span className="bubble-hl">A</span>
      </button>
      {open && (
        <span className="bubble-hl-popover">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className="bubble-swatch"
              title={c.name}
              style={{ background: c.hex }}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().setHighlight({ color: c.hex }).run();
                setOpen(false);
              }}
            />
          ))}
          <button
            type="button"
            className="bubble-swatch bubble-swatch-none"
            title="取消高亮"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetHighlight().run();
              setOpen(false);
            }}
          >
            ⌀
          </button>
        </span>
      )}
    </span>
  );
}

function SelectionToolbar({
  editor,
  onComment,
}: {
  editor: TiptapEditor;
  onComment?: (selectedText: string) => void;
}): React.ReactElement {
  const insertMath = () => {
    const { from, to, empty } = editor.state.selection;
    const latex = empty ? "" : editor.state.doc.textBetween(from, to, " ");
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from, to },
        { type: "mathInline", attrs: { latex } },
      )
      .run();
  };

  const setLink = () => {
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt("链接地址", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, maxWidth: "none" }}
      className="bubble-menu"
    >
      <ToolbarButton
        title="加粗"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        title="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </ToolbarButton>
      <HighlightControl editor={editor} />
      <ToolbarButton
        title="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
      </ToolbarButton>
      <ToolbarButton
        title="公式（选中文本转为 LaTeX）"
        active={editor.isActive("mathInline")}
        onClick={insertMath}
      >
        ∑
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="标题 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        title="标题 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        title="标题 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        title="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Icon d={ICONS.quote} />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="任务列表"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <Icon d={ICONS.todoList} />
      </ToolbarButton>
      <ToolbarButton
        title="项目符号列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <Icon d={ICONS.bulletList} />
      </ToolbarButton>
      <ToolbarButton
        title="编号列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <Icon d={ICONS.orderedList} />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="链接"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Icon d={ICONS.link} />
      </ToolbarButton>
      {onComment && (
        <ToolbarButton
          title="评论（引用选中文本）"
          onClick={() => {
            const { from, to } = editor.state.selection;
            onComment(editor.state.doc.textBetween(from, to, " "));
          }}
        >
          <Icon d={ICONS.comment} />
        </ToolbarButton>
      )}
      <ToolbarButton
        title="清除格式"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <Icon d={ICONS.clear} />
      </ToolbarButton>
    </BubbleMenu>
  );
}

export function MarkdownEditorContent({
  editor,
  onComment,
}: {
  editor: TiptapEditor | null;
  onComment?: (selectedText: string) => void;
}): React.ReactElement {
  return (
    <>
      {editor && <SelectionToolbar editor={editor} onComment={onComment} />}
      <EditorContent editor={editor} className="doc-editor" />
    </>
  );
}
