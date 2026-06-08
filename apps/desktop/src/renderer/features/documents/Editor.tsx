import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
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
import { Markdown } from "tiptap-markdown";
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
        Markdown.configure({
          html: false,
          linkify: true,
          breaks: false,
          transformPastedText: true,
        }),
      ],
      content: initialMarkdown,
    },
    [initialMarkdown, editable],
  );
}

export function getMarkdown(editor: TiptapEditor): string {
  return (
    editor.storage as { markdown?: { getMarkdown: () => string } }
  ).markdown!.getMarkdown();
}

export function MarkdownEditorContent({
  editor,
}: {
  editor: TiptapEditor | null;
}): React.ReactElement {
  return <EditorContent editor={editor} className="doc-editor" />;
}
