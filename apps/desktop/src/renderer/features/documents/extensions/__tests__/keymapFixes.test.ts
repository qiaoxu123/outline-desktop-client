import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  findEditingContext,
  replaceTextblockWithParagraph,
} from "../keymapFixes";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    blockquote: { content: "block+", group: "block" },
    ordered_list: { content: "listItem+", group: "block" },
    listItem: { content: "paragraph block*" },
    text: { group: "inline" },
  },
  marks: { strong: {} },
});

const text = (value: string, bold = false) =>
  schema.text(value, bold ? [schema.marks.strong.create()] : undefined);

describe("KeymapFixes structural editing", () => {
  it("finds a list item when the cursor is inside its paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("ordered_list", null, [
        schema.node("listItem", null, [schema.node("paragraph", null, [text("one")])]),
      ]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    expect(findEditingContext(state.selection.$from)).toMatchObject({
      textblockType: "paragraph",
      listItemDepth: 2,
      listType: "ordered_list",
    });
  });

  it("converts a heading to a paragraph without losing inline marks", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [text("标题", true)]),
      schema.node("paragraph", null, [text("正文")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    });

    const tr = replaceTextblockWithParagraph(state, state.selection.$from);

    expect(tr?.doc.firstChild?.type.name).toBe("paragraph");
    expect(tr?.doc.firstChild?.firstChild?.marks.map((m) => m.type.name)).toEqual([
      "strong",
    ]);
  });
});
