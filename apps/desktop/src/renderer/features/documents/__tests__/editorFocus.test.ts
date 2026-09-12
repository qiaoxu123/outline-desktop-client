import { describe, expect, it } from "vitest";
import { shouldFocusEditor } from "../editorFocus";

describe("new document editor focus", () => {
  it("focuses only when navigation explicitly requests it", () => {
    expect(shouldFocusEditor({ focusEditor: true })).toBe(true);
    expect(shouldFocusEditor({ focusEditor: false })).toBe(false);
    expect(shouldFocusEditor(undefined)).toBe(false);
  });
});
