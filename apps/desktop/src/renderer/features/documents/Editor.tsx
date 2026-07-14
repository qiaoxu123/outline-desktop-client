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
import { OIcon } from "../../components/outlineIcons";
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
/* Icons and button order mirror Outline web's formatting menu exactly
   (app/editor/menus/formatting.tsx + the outline-icons glyphs). */

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
        <OIcon name="highlight" />
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
        <OIcon name="bold" />
      </ToolbarButton>
      <ToolbarButton
        title="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <OIcon name="italic" />
      </ToolbarButton>
      <ToolbarButton
        title="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <OIcon name="strike" />
      </ToolbarButton>
      <HighlightControl editor={editor} />
      <ToolbarButton
        title="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <OIcon name="code" />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="标题 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <OIcon name="h1" />
      </ToolbarButton>
      <ToolbarButton
        title="标题 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <OIcon name="h2" />
      </ToolbarButton>
      <ToolbarButton
        title="标题 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <OIcon name="h3" />
      </ToolbarButton>
      <ToolbarButton
        title="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <OIcon name="quote" />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="公式（选中文本转为 LaTeX）"
        active={editor.isActive("mathInline")}
        onClick={insertMath}
      >
        <OIcon name="math" />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="任务列表"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <OIcon name="todoList" />
      </ToolbarButton>
      <ToolbarButton
        title="项目符号列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <OIcon name="bulletList" />
      </ToolbarButton>
      <ToolbarButton
        title="编号列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <OIcon name="orderedList" />
      </ToolbarButton>

      <span className="bubble-divider" />

      <ToolbarButton
        title="链接"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <OIcon name="link" />
      </ToolbarButton>
      {onComment && (
        <ToolbarButton
          title="评论（引用选中文本）"
          onClick={() => {
            const { from, to } = editor.state.selection;
            onComment(editor.state.doc.textBetween(from, to, " "));
          }}
        >
          <OIcon name="comment" />
        </ToolbarButton>
      )}
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
