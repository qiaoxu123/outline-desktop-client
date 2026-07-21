import { useState, useRef, useEffect } from "react";
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
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import markPlugin from "markdown-it-mark";
import type MarkdownIt from "markdown-it";
import { MathInline, MathBlock } from "./extensions/math";
import { CommentHighlights } from "./extensions/commentHighlights";
import { AttachmentImage } from "./extensions/image";
import { TableControls } from "./extensions/tableControls";
import { KeymapFixes } from "./extensions/keymapFixes";
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
 * Robust GFM table serializer. tiptap-markdown's built-in one bails to an HTML
 * fallback (which, with html:false, writes the literal string "[table]" and
 * DESTROYS the table on save) whenever a cell has more than one block child
 * (e.g. multi-line author cells). This one handles every cell: it renders each
 * block child inline, joining multiple blocks / in-cell line breaks with <br>
 * (the read view turns <br> back into line breaks). Data is never lost.
 */
interface TableSerState {
  inTable?: boolean;
  out: string;
  write: (s: string) => void;
  ensureNewLine: () => void;
  closeBlock: (n: PMNode) => void;
  renderInline: (n: PMNode) => void;
  text: (s: string, escape?: boolean) => void;
  flushClose?: (size?: number) => void;
}

function serializeTable(state: TableSerState, node: PMNode): void {
  state.inTable = true;
  // Emit the pending block separator (e.g. after a preceding heading) BEFORE we
  // start capturing cell output, otherwise the first cell swallows it.
  state.flushClose?.(2);
  node.forEach((row, _rp, rowIdx) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      // Capture each cell's inline markdown so we can post-process it: join
      // multiple block children / hard breaks with <br>, undo the parser's
      // HTML-escaping of literal <br> (&lt;br&gt;), and escape pipes.
      const start = state.out.length;
      cell.forEach((block, _bp, blockIdx) => {
        if (blockIdx) state.write("<br>");
        if (block.isTextblock) state.renderInline(block);
        else state.text(block.textContent);
      });
      let md = state.out.slice(start);
      state.out = state.out.slice(0, start); // rewind — we re-emit below
      md = md
        .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
        .replace(/\r?\n+/g, "<br>")
        .replace(/\|/g, "\\|")
        .trim();
      cells.push(md || " ");
    });
    state.write("| " + cells.join(" | ") + " |");
    state.ensureNewLine();
    if (rowIdx === 0) {
      state.write("| " + cells.map(() => "---").join(" | ") + " |");
      state.ensureNewLine();
    }
  });
  state.closeBlock(node);
  state.inTable = false;
}

/**
 * Inject serializeTable into the live markdown serializer, overriding
 * tiptap-markdown's fragile built-in (see serializeTable). Done post-create
 * because the serializer instance only exists after the editor is built.
 */
function patchTableSerializer(editor: TiptapEditor): void {
  const md = (
    editor.storage as {
      markdown?: {
        serializer?: Record<string, unknown>;
        parser?: { md?: MarkdownIt & { __brPatched?: boolean } };
      };
    }
  ).markdown;

  // Serialize: robust table serializer (see serializeTable).
  const ser = md?.serializer;
  if (ser) {
    const proto = Object.getPrototypeOf(ser);
    const desc = Object.getOwnPropertyDescriptor(proto, "nodes");
    if (desc?.get) {
      Object.defineProperty(ser, "nodes", {
        configurable: true,
        get() {
          return { ...desc.get!.call(this), table: serializeTable };
        },
      });
    }
  }

  // Parse: turn bare <br> into hard breaks (matches the read renderer). Without
  // this the editor parses <br> as literal text and multi-line table cells come
  // back as escaped "&lt;br&gt;", losing the in-cell line breaks on edit.
  const parserMd = md?.parser?.md;
  if (parserMd && !parserMd.__brPatched) {
    parserMd.inline.ruler.before("text", "html_br", (state, silent): boolean => {
      if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
      const rest = state.src.slice(state.pos);
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) {
        if (!silent) state.push("hardbreak", "br", 0);
        state.pos += br[0].length;
        return true;
      }
      // <u> / </u> → emit as raw html so DOMParser maps it to the underline mark
      const u = /^<\/?u>/i.exec(rest);
      if (u) {
        if (!silent) {
          const t = state.push("html_inline", "", 0);
          t.content = u[0].toLowerCase();
        }
        state.pos += u[0].length;
        return true;
      }
      return false;
    });
    // ==highlight== → <mark> (tiptap-markdown parses via the HTML render path,
    // so Highlight's parseHTML picks up <mark>). Matches the read renderer,
    // which already uses the same plugin; without this the editor shows web-
    // created highlights as literal "==text==".
    parserMd.use(markPlugin);
    parserMd.__brPatched = true;
  }
}

/**
 * Underline round-trips as <u>…</u> (no standard markdown syntax; Outline
 * stores it verbatim). The read renderer + editor parser get matching <u>
 * inline rules so it renders and re-parses correctly. Cmd/Ctrl+U comes free
 * from the base Underline extension.
 */
const MarkdownUnderline = Underline.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "<u>", close: "</u>", mixable: true },
        parse: {},
      },
    };
  },
});

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
  onFiles?: (files: File[], pos: number) => void,
  onLinkClick?: (href: string) => void,
): TiptapEditor | null {
  // onFiles/onLinkClick are read through refs so the (once-created) editorProps
  // handlers below always call the latest callback (which closes over the live
  // editor / router).
  const filesRef = useRef(onFiles);
  filesRef.current = onFiles;
  const linkRef = useRef(onLinkClick);
  linkRef.current = onLinkClick;
  // Created once per component mount (callers remount via key per document) —
  // recreating on every content/prop change would reset the cursor mid-typing.
  const editor = useEditor(
    {
      editable,
      editorProps: {
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || !filesRef.current) return false;
          event.preventDefault();
          filesRef.current(files, view.state.selection.from);
          return true;
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || !filesRef.current) return false;
          event.preventDefault();
          const at = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          filesRef.current(files, at?.pos ?? view.state.selection.from);
          return true;
        },
        handleClick: (_view, _pos, event) => {
          // Route link clicks through onLinkClick: internal doc links open as an
          // in-app tab, external links open in the system browser.
          const a = (event.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href");
          if (a && href && linkRef.current) {
            event.preventDefault();
            linkRef.current(href);
            return true;
          }
          return false;
        },
      },
      extensions: [
        StarterKit,
        // openOnClick off — handleClick above routes internal links to an in-app
        // tab and external links to the system browser.
        Link.configure({ openOnClick: false }),
        AttachmentImage,
        TaskList,
        TaskItem.configure({ nested: true }),
        ScrollableTable,
        TableRow,
        TableCell,
        TableHeader,
        TableControls,
        KeymapFixes,
        Placeholder.configure({ placeholder: "开始编写…" }),
        MarkdownUnderline,
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

  // Override the fragile built-in table serializer + add <br>/<u> parser rules
  // once the editor (and its markdown serializer/parser) exist.
  useEffect(() => {
    if (!editor) return;
    patchTableSerializer(editor);
    // The initial content was parsed before the <u> / ==highlight== rules were
    // installed, so those came through as literal text. Re-parse once with the
    // patched parser (emitUpdate=false so it doesn't trigger a save).
    if (/<u>/i.test(initialMarkdown) || /==[^=]/.test(initialMarkdown)) {
      editor.commands.setContent(initialMarkdown, false);
    }
  }, [editor, initialMarkdown]);

  return editor;
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
        title="下划线 (⌘U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <OIcon name="underline" />
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
      <ToolbarButton
        title="插入表格 (3×3)"
        active={editor.isActive("table")}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <OIcon name="table" />
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

/* ---------- table row/column menu (like Outline web) ----------
 * Insert is handled by the ⊕ grip buttons (see TableControls). This menu only
 * appears once a whole row or column is selected by clicking its grip, and
 * offers the operations that don't have a ⊕ affordance — header toggle, insert
 * before/after, merge/split, delete row/col, delete table. */

function TableMenu({ editor }: { editor: TiptapEditor }): React.ReactElement {
  // Re-render on selection changes so the row/column branch stays current.
  const [, force] = useState(0);
  useEffect(() => {
    const h = (): void => force((x) => x + 1);
    editor.on("selectionUpdate", h);
    editor.on("transaction", h);
    return () => {
      editor.off("selectionUpdate", h);
      editor.off("transaction", h);
    };
  }, [editor]);

  const sel = editor.state.selection;
  const isRow = sel instanceof CellSelection && sel.isRowSelection();
  const isCol = sel instanceof CellSelection && sel.isColSelection();

  const chain = () => editor.chain().focus();
  const item = (
    icon: string,
    label: string,
    run: () => void,
    danger = false,
  ) => (
    <button
      type="button"
      className={`table-menu-item ${danger ? "danger" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <span className="table-menu-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor: ed }) => {
        const s = ed.state.selection;
        return (
          s instanceof CellSelection &&
          (s.isRowSelection() || s.isColSelection())
        );
      }}
      tippyOptions={{ duration: 100, placement: "bottom-start", maxWidth: "none" }}
      className="table-menu"
    >
      {isRow &&
        item("⊞", "切换表头", () => chain().toggleHeaderRow().run())}
      {isCol &&
        item("⊞", "切换表头", () => chain().toggleHeaderColumn().run())}
      {isRow &&
        item("↑", "在上方插入行", () => chain().addRowBefore().run())}
      {isRow &&
        item("↓", "在下方插入行", () => chain().addRowAfter().run())}
      {isCol &&
        item("←", "在左侧插入列", () => chain().addColumnBefore().run())}
      {isCol &&
        item("→", "在右侧插入列", () => chain().addColumnAfter().run())}
      {item("⿹", "合并 / 拆分单元格", () => chain().mergeOrSplit().run())}
      <span className="table-menu-divider" />
      {isRow &&
        item("🗑", "删除此行", () => chain().deleteRow().run(), true)}
      {isCol &&
        item("🗑", "删除此列", () => chain().deleteColumn().run(), true)}
      {item("✕", "删除整个表格", () => chain().deleteTable().run(), true)}
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
      {editor && <TableMenu editor={editor} />}
      <EditorContent editor={editor} className="doc-editor" />
    </>
  );
}
