import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export interface EditingContext {
  textblockType: string;
  listItemDepth: number | null;
  listType: string | null;
  blockquoteDepth: number | null;
}

/** Resolve the structural containers around the cursor, not just its paragraph. */
export function findEditingContext($from: ResolvedPos): EditingContext {
  let listItemDepth: number | null = null;
  let listType: string | null = null;
  let blockquoteDepth: number | null = null;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "listItem" && listItemDepth === null) {
      listItemDepth = depth;
      listType = $from.node(depth - 1).type.name;
    }
    if (node.type.name === "blockquote" && blockquoteDepth === null) {
      blockquoteDepth = depth;
    }
  }

  return {
    textblockType: $from.parent.type.name,
    listItemDepth,
    listType,
    blockquoteDepth,
  };
}

/** Convert a text block to a paragraph while retaining its inline marks. */
export function replaceTextblockWithParagraph(
  state: EditorState,
  $from: ResolvedPos,
): Transaction | null {
  if (!$from.parent.isTextblock || $from.parent.type.name === "paragraph") {
    return null;
  }
  const pos = $from.before();
  const paragraph = state.schema.nodes.paragraph.create(
    null,
    $from.parent.content,
  );
  return state.tr.replaceWith(pos, pos + $from.parent.nodeSize, paragraph);
}

function selectedTextBlocks(editor: Editor) {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const blocks: { pos: number; text: string; code: boolean }[] = [];
  const start = empty ? Math.max(0, from - 1) : from;
  const end = empty ? from : to;

  state.doc.nodesBetween(start, end, (node: PMNode, pos: number) => {
    if (!node.isTextblock) return;
    // A cursor-only nodesBetween range does not descend into its parent.
    if (empty && !(from >= pos && from <= pos + node.nodeSize)) return;
    blocks.push({
      pos,
      text: node.textContent,
      code: node.type.name === "codeBlock",
    });
  });

  if (!blocks.length) {
    const { $from } = state.selection;
    blocks.push({
      pos: $from.before(),
      text: $from.parent.textContent,
      code: $from.parent.type.name === "codeBlock",
    });
  }
  return blocks;
}

function shiftSelectedLines(editor: Editor, left: boolean): boolean {
  const { state } = editor;
  const blocks = selectedTextBlocks(editor);
  const tr = state.tr;

  // Work backwards so inserting/removing one line cannot invalidate the next
  // position. Two spaces match the indentation used by Markdown documents.
  [...blocks].reverse().forEach(({ pos, text, code }) => {
    const lineStarts = code
      ? [0, ...Array.from(text.matchAll(/\n/g), (match) => (match.index ?? 0) + 1)]
      : [0];
    [...lineStarts].reverse().forEach((offset) => {
      const at = pos + 1 + offset;
      if (left) {
        const amount = text.slice(offset, offset + 2).match(/^ {1,2}/)?.[0].length ?? 0;
        if (amount) tr.delete(at, at + amount);
      } else {
        tr.insertText("  ", at);
      }
    });
  });

  if (!tr.steps.length) return false;
  editor.view.dispatch(tr);
  return true;
}

/**
 * Typora-style editing behaviours:
 * - Backspace at the start of a heading clears the # marks (→ paragraph)
 * - Backspace at the start of a list item lifts it out of the list
 * - Backspace at the start of a blockquote lifts it out of the quote
 * - Backspace at the start of a code block converts to paragraph
 * - Backspace on an empty first paragraph deletes it
 * - Enter at the end of a heading / code block creates a paragraph after it
 */
export const KeymapFixes = Extension.create({
  name: "keymapFixes",

  // Must run BEFORE TipTap's core Keymap extension (priority 100, registered
  // ahead of user extensions). Otherwise its Enter → newlineInCode/splitBlock
  // intercepts first, and these Typora-style handlers (Enter-exit heading /
  // code block, Backspace-at-block-start) never fire.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        // Cursor must be at the very start of its parent block
        if ($from.parentOffset !== 0) return false;

        const context = findEditingContext($from);
        const parentType = context.textblockType;

        // 1. Heading: Backspace at start → remove heading formatting
        if (parentType === "heading") {
          const tr = replaceTextblockWithParagraph(state, $from);
          return tr
            ? this.editor
            .chain()
            .command(({ tr: commandTr }) => {
              commandTr.step(tr.steps[0]);
              return true;
            })
            .focus()
            .run()
            : false;
        }

        // 2. Bullet list / ordered list / task list item: lift out
        if (context.listItemDepth !== null) {
          return this.editor.chain().liftListItem("listItem").focus().run();
        }

        // 3. Blockquote: lift out
        if (context.blockquoteDepth !== null) {
          return this.editor.chain().lift("blockquote").focus().run();
        }

        // 4. Code block: convert to paragraph
        if (parentType === "codeBlock") {
          const tr = replaceTextblockWithParagraph(state, $from);
          return tr
            ? this.editor
            .chain()
            .command(({ tr: commandTr }) => {
              commandTr.step(tr.steps[0]);
              return true;
            })
            .focus()
            .run()
            : false;
        }

        // 5. Empty first paragraph at document start: delete it
        if (parentType === "paragraph" && $from.depth === 1) {
          const para = $from.parent;
          if (para.content.size === 0 && $from.before(1) === 0 && state.doc.childCount >= 2) {
            return this.editor
              .chain()
              .command(({ tr }) => {
                tr.delete(0, para.nodeSize);
                return true;
              })
              .focus()
              .run();
          }
        }

        return false;
      },

      // Enter at the very end of a heading / code block → new paragraph after it
      // (headings: don't spawn another heading; code blocks: escape the block,
      // since the default Enter would just keep adding lines inside the code).
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        const parentType = $from.parent.type.name;
        if (parentType !== "heading" && parentType !== "codeBlock") return false;
        // Only when the cursor is at the very end of the block's content —
        // mid-block Enter still behaves normally (new line in code / heading).
        if ($from.parentOffset !== $from.parent.content.size) return false;

        const pos = $from.after();
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.insert(pos, state.schema.nodes.paragraph.create());
            return true;
          })
          // No .focus(): the user is already typing in the editor, and an
          // explicit focus command can fail in headless/automation contexts,
          // aborting the chain so Enter falls through to newlineInCode.
          .setTextSelection(pos + 1)
          .run();
      },

      // VS Code-compatible line indentation. In a code block this applies to
      // every selected line; for ordinary text blocks it shifts the block's
      // leading indentation as well.
      "Mod-]": () => shiftSelectedLines(this.editor, false),
      "Mod-[": () => shiftSelectedLines(this.editor, true),
    };
  },
});

export default KeymapFixes;
