import { describe, it, expect } from "vitest";
import type { OutlineNode } from "../types";
import {
  findNode,
  visibleNodesInOrder,
  setText,
  setNote,
  toggleCollapse,
  insertSiblingAfter,
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
