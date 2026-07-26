import { describe, it, expect } from "vitest";
import { outlineFilePath, outlineCacheKey, makeNodeId, emptyNode } from "../types";

describe("types helpers", () => {
  it("builds per-user file path under 大纲/", () => {
    expect(outlineFilePath("u1")).toBe("大纲/u1.json");
  });
  it("builds versioned cache key", () => {
    expect(outlineCacheKey("u1")).toBe("outline.cache.u1.v1");
  });
  it("makeNodeId is deterministic given inputs", () => {
    expect(makeNodeId(1000, 0.5)).toBe("on_1000_500000");
  });
  it("emptyNode is a blank expanded leaf", () => {
    expect(emptyNode("x")).toEqual({ id: "x", text: "", collapsed: false, children: [] });
  });
});
