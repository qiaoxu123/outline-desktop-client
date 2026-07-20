import { Extension } from "@tiptap/core";

/**
 * ProseMirror's default Backspace can't delete an empty paragraph that is the
 * very first node of the document — `joinBackward` has nothing before it, so
 * the empty leading line just sits there and feels un-deletable. This adds a
 * Backspace handler for exactly that case: at the start of an empty top-level
 * paragraph that is the doc's first child (and not its only child), remove it
 * so the following block becomes first.
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
        // top-level paragraph only (depth 1), cursor at its very start
        if ($from.depth !== 1 || $from.parentOffset !== 0) return false;
        const para = $from.parent;
        if (para.type.name !== "paragraph" || para.content.size !== 0) {
          return false;
        }
        // must be the document's first child, with something after it to keep
        if ($from.before(1) !== 0 || state.doc.childCount < 2) return false;
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.delete(0, para.nodeSize);
            return true;
          })
          .focus()
          .run();
      },
    };
  },
});

export default KeymapFixes;
