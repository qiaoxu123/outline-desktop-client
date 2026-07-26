import { describe, it, expect } from "vitest";
import type { OutlineNode } from "../types";
import {
  findNode,
  visibleNodesInOrder,
  setText,
  setNote,
  toggleCollapse,
  insertSiblingAfter,
  indent,
  outdent,
  moveUp,
  moveDown,
  mergeDelete,
  dragMove,
} from "../outlineOps";

const n = (id: string, children: OutlineNode[] = [], collapsed = false): OutlineNode => ({
  id,
  text: id,
  collapsed,
  children,
});

// a
// ├─ b (collapsed) → b1
// └─ c
const tree = (): OutlineNode[] => [n("a", [n("b", [n("b1")], true), n("c")])];

describe("findNode", () => {
  it("finds nested", () => {
    expect(findNode(tree(), "b1")?.id).toBe("b1");
  });
  it("returns null when absent", () => {
    expect(findNode(tree(), "zzz")).toBeNull();
  });
});

describe("visibleNodesInOrder", () => {
  it("skips children of collapsed nodes", () => {
    expect(visibleNodesInOrder(tree()).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("setText / setNote", () => {
  it("setText is immutable and updates one node", () => {
    const before = tree();
    const after = setText(before, "c", "hello");
    expect(findNode(after, "c")?.text).toBe("hello");
    expect(findNode(before, "c")?.text).toBe("c"); // original untouched
  });
  it("setNote sets note", () => {
    expect(findNode(setNote(tree(), "a", "memo"), "a")?.note).toBe("memo");
  });
});

describe("toggleCollapse", () => {
  it("flips collapsed", () => {
    expect(findNode(toggleCollapse(tree(), "b"), "b")?.collapsed).toBe(false);
  });
});

describe("insertSiblingAfter", () => {
  it("inserts right after target at same level", () => {
    const node: OutlineNode = { id: "new", text: "new", collapsed: false, children: [] };
    const after = insertSiblingAfter(tree(), "b", node);
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "new", "c"]);
  });
  it("inserts after a top-level node", () => {
    const node: OutlineNode = { id: "top2", text: "", collapsed: false, children: [] };
    expect(insertSiblingAfter(tree(), "a", node).map((x) => x.id)).toEqual(["a", "top2"]);
  });
});

describe("indent / outdent", () => {
  it("indent makes node last child of previous sibling", () => {
    const after = indent(tree(), "c"); // a: [b] , c -> under b
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b"]);
    expect(findNode(after, "b")?.children.map((x) => x.id)).toEqual(["b1", "c"]);
  });
  it("indent is no-op without previous sibling", () => {
    const after = indent(tree(), "b");
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("outdent lifts node to after its parent", () => {
    const after = outdent(tree(), "b1"); // b1 under b -> sibling after b
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "b1", "c"]);
  });
  it("outdent is no-op at top level", () => {
    expect(outdent(tree(), "a").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("moveUp / moveDown", () => {
  it("moveDown swaps with next sibling", () => {
    expect(findNode(moveDown(tree(), "b"), "a")?.children.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("moveUp swaps with previous sibling", () => {
    expect(findNode(moveUp(tree(), "c"), "a")?.children.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("moveUp no-op for first child", () => {
    expect(findNode(moveUp(tree(), "b"), "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("mergeDelete", () => {
  it("merges text into previous visible node and removes self", () => {
    // visible order: a,b,c  → merge c into b
    const r = mergeDelete(tree(), "c");
    expect(r.focusId).toBe("b");
    expect(r.caretOffset).toBe(1); // "b".length
    expect(findNode(r.root, "c")).toBeNull();
    expect(findNode(r.root, "b")?.text).toBe("bc");
  });
  it("no-op for first top node", () => {
    const r = mergeDelete(tree(), "a");
    expect(r.focusId).toBeNull();
    expect(findNode(r.root, "a")).not.toBeNull();
  });
});

describe("dragMove", () => {
  it("moves node under a new parent at index", () => {
    const after = dragMove(tree(), "c", "b", 0); // c -> first child of b
    expect(findNode(after, "b")?.children.map((x) => x.id)).toEqual(["c", "b1"]);
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b"]);
  });
  it("moves node to top level at index", () => {
    const after = dragMove(tree(), "c", null, 0); // c -> top, before a
    expect(after.map((x) => x.id)).toEqual(["c", "a"]);
  });
  it("refuses to move into own descendant", () => {
    const after = dragMove(tree(), "b", "b1", 0); // b into its own child b1 → no-op
    expect(findNode(after, "a")?.children.map((x) => x.id)).toEqual(["b", "c"]);
  });
});
