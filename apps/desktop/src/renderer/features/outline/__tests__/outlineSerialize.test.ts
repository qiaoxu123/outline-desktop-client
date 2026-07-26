import { describe, it, expect } from "vitest";
import type { OutlineNode } from "../types";
import { toMarkdown, parseMarkdown, toExportMarkdown } from "../outlineSerialize";

const strip = (nodes: OutlineNode[]): unknown =>
  nodes.map((n) => ({
    text: n.text,
    note: n.note ?? undefined,
    children: strip(n.children),
  }));

const sample = (): OutlineNode[] => [
  {
    id: "1",
    text: "核心思路",
    collapsed: false,
    children: [
      { id: "2", text: "**核心洞察**：路侧相机固定", note: "多行备注\n第二行", collapsed: false, children: [] },
      { id: "3", text: "研究问题", collapsed: false, children: [] },
    ],
  },
];

describe("toMarkdown", () => {
  it("emits nested bullet list with indented note", () => {
    expect(toMarkdown(sample())).toBe(
      [
        "- 核心思路",
        "  - **核心洞察**：路侧相机固定",
        "    多行备注",
        "    第二行",
        "  - 研究问题",
      ].join("\n"),
    );
  });
});

describe("round-trip", () => {
  it("tree -> md -> tree is structurally stable (ignoring id/collapsed)", () => {
    const md = toMarkdown(sample());
    const back = parseMarkdown(md);
    expect(strip(back)).toEqual(strip(sample()));
  });
});

describe("toExportMarkdown", () => {
  it("prepends H1 title", () => {
    const doc = {
      id: "d",
      title: "论文调研",
      root: sample(),
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    };
    expect(toExportMarkdown(doc).startsWith("# 论文调研\n\n- 核心思路")).toBe(true);
  });
});
