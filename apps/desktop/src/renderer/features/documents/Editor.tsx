import {
  useEditor,
  EditorContent,
  BubbleMenu,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Markdown } from "tiptap-markdown";
import "katex/dist/katex.min.css";
import "./Editor.css";

/**
 * In-place rich text editor — TipTap (ProseMirror, the same engine Outline
 * uses) with two-way markdown conversion. The content area looks identical
 * to the read view; you simply start typing.
 */
export function useMarkdownEditor(
  initialMarkdown: string,
  editable: boolean,
): TiptapEditor | null {
  // Created once per component mount (callers remount via key per document) —
  // recreating on every content/prop change would reset the cursor mid-typing.
  return useEditor(
    {
      editable,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Image,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({ placeholder: "开始编写…" }),
        // Renders $inline$ / $$block$$ LaTeX with KaTeX while keeping the
        // source text (so markdown round-trip is preserved).
        Mathematics.configure({
          katexOptions: { throwOnError: false },
        }),
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

/* ---------- selection toolbar (bubble menu) ---------- */

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

function SelectionToolbar({
  editor,
}: {
  editor: TiptapEditor;
}): React.ReactElement {
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
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
      <ToolbarButton
        title="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
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
        title="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </ToolbarButton>
      <ToolbarButton
        title="项目符号列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>
      <span className="bubble-divider" />
      <ToolbarButton
        title="链接"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = (editor.getAttributes("link").href as string) ?? "";
          const url = window.prompt("链接地址", prev);
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          } else {
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }
        }}
      >
        🔗
      </ToolbarButton>
    </BubbleMenu>
  );
}

export function MarkdownEditorContent({
  editor,
}: {
  editor: TiptapEditor | null;
}): React.ReactElement {
  return (
    <>
      {editor && <SelectionToolbar editor={editor} />}
      <EditorContent editor={editor} className="doc-editor" />
    </>
  );
}
