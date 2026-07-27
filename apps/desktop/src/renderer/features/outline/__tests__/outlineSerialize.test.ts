import { describe, it, expect } from "vitest";
import type { Block, Page } from "../types";
import { toMarkdown, toExportMarkdown, parsePastedOutline } from "../outlineSerialize";

const strip = (blocks: Block[]): unknown =>
  blocks.map((b) => ({
    text: b.text,
    children: strip(b.children),
  }));

const sample = (): Block[] => [
  {
    id: "1",
    text: "核心思路",
    collapsed: false,
    children: [
      { id: "2", text: "**核心洞察**：路侧相机固定\n第二行", collapsed: false, children: [] },
      { id: "3", text: "研究问题", collapsed: false, children: [] },
    ],
  },
];

describe("toMarkdown", () => {
  it("emits nested bullet list with 2-space indent per depth", () => {
    expect(toMarkdown(sample())).toBe(
      [
        "- 核心思路",
        "  - **核心洞察**：路侧相机固定",
        "    第二行",
        "  - 研究问题",
      ].join("\n"),
    );
  });
});

describe("toExportMarkdown", () => {
  it("prepends H1 title", () => {
    const page: Page = {
      id: "d",
      title: "论文调研",
      root: sample(),
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    };
    expect(toExportMarkdown(page).startsWith("# 论文调研\n\n- 核心思路")).toBe(true);
  });
});

describe("parsePastedOutline", () => {
  it("parses tab-indented text", () => {
    const back = parsePastedOutline("A\n\tB\n\tC");
    expect(strip(back)).toEqual([
      { text: "A", children: [{ text: "B", children: [] }, { text: "C", children: [] }] },
    ]);
  });

  it("parses 2-space-indented text", () => {
    const back = parsePastedOutline("A\n  B\n  C");
    expect(strip(back)).toEqual([
      { text: "A", children: [{ text: "B", children: [] }, { text: "C", children: [] }] },
    ]);
  });

  it("strips `- ` bullets", () => {
    const back = parsePastedOutline("- A\n  - B\n  - C");
    expect(strip(back)).toEqual([
      { text: "A", children: [{ text: "B", children: [] }, { text: "C", children: [] }] },
    ]);
  });

  it("treats flat text as all siblings", () => {
    const back = parsePastedOutline("A\nB\nC");
    expect(strip(back)).toEqual([
      { text: "A", children: [] },
      { text: "B", children: [] },
      { text: "C", children: [] },
    ]);
  });
});
