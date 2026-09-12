import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentTitleControl } from "../DocumentTitleControl";

describe("DocumentTitleControl", () => {
  it("renders a clickable title before the user starts editing", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentTitleControl, {
        title: "新文档",
        editing: false,
        onStartEditing: vi.fn(),
        onChange: vi.fn(),
        onCommit: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="编辑文档标题"');
    expect(html).toContain("新文档");
    expect(html).not.toContain('aria-label="文档标题"');
  });

  it("renders a focused text input after editing starts", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentTitleControl, {
        title: "新文档",
        editing: true,
        onStartEditing: vi.fn(),
        onChange: vi.fn(),
        onCommit: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="文档标题"');
    expect(html).toContain("autofocus");
  });
});
