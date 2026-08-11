import { Extension } from "@tiptap/core";

/**
 * Typora-style editing behaviours:
 * - Backspace at the start of a heading clears the # marks (→ paragraph)
 * - Backspace at the start of a list item lifts it out of the list
 * - Backspace at the start of a blockquote lifts it out of the quote
 * - Backspace at the start of a code block converts to paragraph
 * - Backspace on an empty first paragraph deletes it
 */
export const KeymapFixes = Extension.create({
  name: "keymapFixes",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        // Cursor must be at the very start of its parent block
        if ($from.parentOffset !== 0) return false;

        const parentType = $from.parent.type.name;

        // 1. Heading: Backspace at start → remove heading formatting
        if (parentType === "heading") {
          const level = $from.parent.attrs.level as number;
          const text = $from.parent.textContent;
          const pos = $from.before();
          const nodeSize = $from.parent.nodeSize;
          return this.editor
            .chain()
            .command(({ tr }) => {
              tr.replaceWith(pos, pos + nodeSize, state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null));
              return true;
            })
            .focus()
            .run();
        }

        // 2. Bullet list / ordered list / task list item: lift out
        if (parentType === "listItem") {
          // Only at depth 2+ (inside a list)
          if ($from.depth >= 2) {
            return this.editor.chain().liftListItem("listItem").focus().run();
          }
          return false;
        }

        // 3. Blockquote: lift out
        if (parentType === "blockquote") {
          const text = $from.parent.textContent;
          const pos = $from.before();
          const nodeSize = $from.parent.nodeSize;
          return this.editor
            .chain()
            .command(({ tr }) => {
              tr.replaceWith(pos, pos + nodeSize, state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null));
              return true;
            })
            .focus()
            .run();
        }

        // 4. Code block: convert to paragraph
        if (parentType === "codeBlock") {
          const text = $from.parent.textContent;
          const pos = $from.before();
          const nodeSize = $from.parent.nodeSize;
          return this.editor
            .chain()
            .command(({ tr }) => {
              tr.replaceWith(pos, pos + nodeSize, state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null));
              return true;
            })
            .focus()
            .run();
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

      // Enter at end of heading → new paragraph (not another heading)
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        // Cursor at the very end of a heading
        if ($from.parent.type.name !== "heading") return false;
        if ($from.parentOffset !== $from.parent.content.size) return false;

        const pos = $from.after();
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.insert(pos, state.schema.nodes.paragraph.create());
            return true;
          })
          .focus()
          .setTextSelection(pos + 1)
          .run();
      },
    };
  },
});

export default KeymapFixes;
