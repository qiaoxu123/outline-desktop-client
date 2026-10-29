import { useEffect } from "react";
import { useEditor, EditorContent, BubbleMenu, type Editor as TiptapEditor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import type MarkdownIt from "markdown-it";
import highlightRule from "../../lib/markdown/highlightRule";
import { normalizeOutlineMarkdown } from "../../lib/markdown/normalize";
import { OIcon } from "../../components/outlineIcons";
import "../documents/Editor.css";

export interface NodeEditorProps {
  initialMarkdown: string;
  /** Caret position on mount: line start, line end, or a plain-text offset. */
  autoFocusCaret?: "start" | "end" | number;
  onChange: (markdown: string) => void;
  onEnter: (before: string, after: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMergeBackspace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  /** ↑ pressed at the first line — focus the previous visible node. */
  onFocusPrev: () => void;
  /** ↓ pressed at the last line — focus the next visible node. */
  onFocusNext: () => void;
  onBlur: (markdown: string) => void;
}

/**
 * Highlight serialized to `==text==`, matching Editor.tsx's MarkdownHighlight
 * so a node round-trips highlighted text through the outline's markdown
 * storage exactly like the document editor (and Outline web) do.
 */
const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "==", close: "==", expelEnclosingWhitespace: true },
        parse: {},
      },
    };
  },
}).configure({ multicolor: true });

/** Read the live markdown serialization from tiptap-markdown's storage. */
function getMarkdown(editor: TiptapEditor): string {
  return (editor.storage as { markdown: { getMarkdown(): string } }).markdown
    .getMarkdown()
    .trim();
}

/**
 * Install Outline's `==highlight==` inline rule into tiptap-markdown's parser
 * (see lib/markdown/highlightRule.ts) so initial content containing
 * highlights parses identically to the document editor and Outline web.
 * Mirrors the patch in Editor.tsx's useMarkdownEditor, minus the
 * table-serializer bits this single-line editor never needs.
 */
function patchHighlightParser(editor: TiptapEditor): void {
  const parserMd = (
    editor.storage as {
      markdown?: { parser?: { md?: MarkdownIt & { __hlPatched?: boolean } } };
    }
  ).markdown?.parser?.md;
  if (parserMd && !parserMd.__hlPatched) {
    parserMd.use(highlightRule);
    parserMd.__hlPatched = true;
  }
}

function caretAtStart(view: EditorView): boolean {
  const { $from, empty } = view.state.selection;
  return empty && $from.parentOffset === 0;
}

function caretAtEnd(view: EditorView): boolean {
  const { $from, empty } = view.state.selection;
  return empty && $from.parentOffset === $from.parent.content.size;
}

/**
 * Split the node's full markdown at the caret. This is an approximation: the
 * split index is the caret's PLAIN-TEXT offset, not a true markdown-source
 * offset, so a caret sitting inside a marked span (**bold**, ==hl==) can be
 * off by the marker's character count. Accepted MVP limitation (see task
 * brief) — precise splitting would require splitting the ProseMirror doc
 * itself (e.g. via `splitBlock`) and re-serializing each half separately.
 */
function splitAtCaret(
  view: EditorView,
  fullMarkdown: string,
): { before: string; after: string } {
  const pos = view.state.selection.from;
  const plainBefore = view.state.doc.textBetween(0, pos);
  const idx = Math.min(plainBefore.length, fullMarkdown.length);
  return { before: fullMarkdown.slice(0, idx), after: fullMarkdown.slice(idx) };
}

/**
 * Constrain the document schema to exactly one paragraph. StarterKit's
 * default Document is `content: 'block+'`, which lets pasted multi-paragraph
 * text create multiple paragraph nodes — breaking the "a node is a single
 * line" invariant that caretAtStart/caretAtEnd (and thus onMergeBackspace/
 * onFocusPrev/onFocusNext) rely on. With exactly one paragraph, the
 * paragraph IS the whole node, so those $from.parentOffset checks stay
 * correct. tiptap-markdown still serializes fine: it needs at least one
 * paragraph block to carry the inline content through getMarkdown().
 */
const SingleParagraphDocument = Document.extend({ content: "paragraph" });

/**
 * Inline-only TipTap editor mounted on exactly the currently-focused outline
 * node. Renders one line of WYSIWYG markdown (bold/italic/code/highlight/
 * link/underline — no block nodes, no hard breaks) and intercepts
 * structural/navigation keys, forwarding them to the outline's own
 * split/indent/move logic instead of letting ProseMirror handle them.
 *
 * Remount contract: the parent MUST remount this component via a per-node
 * React `key` (only one node is ever focused/mounted at a time). The mount
 * effect below only applies `initialMarkdown`/`autoFocusCaret` once, on
 * `[editor]` — matching the document editor's remount-per-document
 * precedent (features/documents/Editor.tsx's useMarkdownEditor).
 */
export default function NodeEditor(props: NodeEditorProps): React.ReactElement {
  const editor = useEditor(
    {
      extensions: [
        // Single-paragraph schema base — see SingleParagraphDocument.
        SingleParagraphDocument,
        // Block nodes disabled — every outline node renders as a single line.
        StarterKit.configure({
          document: false,
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          hardBreak: false,
          strike: false,
        }),
        Underline,
        Link.configure({ openOnClick: false }),
        MarkdownHighlight,
        Markdown.configure({ html: false, transformPastedText: true }),
      ],
      content: normalizeOutlineMarkdown(props.initialMarkdown),
      editorProps: {
        handleKeyDown(view, event) {
          if (!editor) return false;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const { before, after } = splitAtCaret(view, getMarkdown(editor));
            props.onEnter(before, after);
            return true;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            if (event.shiftKey) props.onOutdent();
            else props.onIndent();
            return true;
          }
          if (event.key === "Backspace" && caretAtStart(view)) {
            event.preventDefault();
            props.onMergeBackspace();
            return true;
          }
          if (event.altKey && event.key === "ArrowUp") {
            event.preventDefault();
            props.onMoveUp();
            return true;
          }
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            props.onMoveDown();
            return true;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === ".") {
            event.preventDefault();
            props.onToggleCollapse();
            return true;
          }
          if (event.key === "ArrowUp" && caretAtStart(view)) {
            event.preventDefault();
            props.onFocusPrev();
            return true;
          }
          if (event.key === "ArrowDown" && caretAtEnd(view)) {
            event.preventDefault();
            props.onFocusNext();
            return true;
          }
          return false;
        },
      },
      onUpdate({ editor: e }) {
        props.onChange(getMarkdown(e));
      },
      onBlur({ editor: e }) {
        props.onBlur(getMarkdown(e));
      },
    },
    [],
  );

  // Patch the ==highlight== parser rule once the editor (and its markdown
  // parser instance) exist, re-parse if the initial content needed it, then
  // place the caret per autoFocusCaret.
  useEffect(() => {
    if (!editor) return;
    patchHighlightParser(editor);
    if (/==[^=]/.test(props.initialMarkdown)) {
      editor.commands.setContent(normalizeOutlineMarkdown(props.initialMarkdown), false);
    }
    const caret = props.autoFocusCaret ?? "end";
    if (caret === "start") editor.commands.focus("start");
    else if (caret === "end") editor.commands.focus("end");
    else editor.commands.focus(caret + 1); // markdown offset ≈ doc pos (approximation)
  }, [editor]);

  return (
    // A single host wrapper (not a fragment) keeps React's unmount safe: tippy
    // moves the BubbleMenu element into its own [data-tippy-root], so removing
    // that element individually from a fragment parent throws
    // "NotFoundError: removeChild ... not a child of this node" and crashes the
    // renderer. Removing this wrapper instead detaches the whole subtree.
    <div className="ol-node-editor-wrap" style={{ display: "contents" }}>
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey="outlineNodeTextMenu"
          updateDelay={0}
          shouldShow={({ editor: ed, state, from, to }) =>
            ed.isEditable &&
            !state.selection.empty &&
            state.doc.textBetween(from, to, " ").trim().length > 0
          }
          // Must stay under #root — see Editor.tsx: tippy moves this element
          // out of the editor subtree and React only delegates events from
          // nodes inside its root container; appending to body would make
          // every toolbar button inert.
          tippyOptions={{
            duration: 0,
            maxWidth: "none",
            appendTo: () => document.getElementById("root") ?? document.body,
            zIndex: 1000,
          }}
          className="bubble-menu"
        >
          {([
            ["bold", "加粗", "bold"],
            ["italic", "斜体", "italic"],
            ["underline", "下划线", "underline"],
            ["code", "行内代码", "code"],
            ["highlight", "高亮", "highlight"],
          ] as const).map(([mark, title, icon]) => (
            <button
              key={mark}
              type="button"
              title={title}
              className={`bubble-btn ${editor.isActive(mark) ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                const chain = editor.chain().focus();
                if (mark === "bold") chain.toggleBold().run();
                else if (mark === "italic") chain.toggleItalic().run();
                else if (mark === "underline") chain.toggleUnderline().run();
                else if (mark === "code") chain.toggleCode().run();
                else chain.toggleHighlight().run();
              }}
            >
              <OIcon name={icon} />
            </button>
          ))}
          <span className="bubble-divider" />
          <button
            type="button"
            title="插入或移除链接"
            className={`bubble-btn ${editor.isActive("link") ? "active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              const prev = (editor.getAttributes("link").href as string) ?? "";
              const href = window.prompt("链接地址（留空移除链接）", prev);
              if (href === null) return;
              if (href.trim()) editor.chain().focus().setLink({ href: href.trim() }).run();
              else editor.chain().focus().unsetLink().run();
            }}
          >
            <OIcon name="link" />
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="ol-node-editor" />
    </div>
  );
}
