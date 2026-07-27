import { describe, it, expect } from "vitest";
import { outlineFilePath, outlineCacheKey, makeBlockId, emptyBlock } from "../types";

describe("types helpers", () => {
  it("builds per-user file path under 大纲笔记/", () => {
    expect(outlineFilePath("u1")).toBe("大纲笔记/u1.json");
  });
  it("builds versioned cache key", () => {
    expect(outlineCacheKey("u1")).toBe("outline2.cache.u1.v1");
  });
  it("makeBlockId is deterministic given inputs", () => {
    expect(makeBlockId(1000, 0.5)).toBe("ob_1000_500000");
  });
  it("emptyBlock is a blank expanded leaf", () => {
    expect(emptyBlock("x")).toEqual({ id: "x", text: "", collapsed: false, children: [] });
  });
});
