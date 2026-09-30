import { describe, expect, it } from "vitest";
import { renderOfficialWebHtml } from "../officialWebHtml";

const template = '<html lang="{lang}"><head>{head-tags}{env}</head><body>{content}{script-tags}</body></html>';
const manifest = {
  "app/index.tsx": { file: "assets/index.js", css: ["assets/app.css"], imports: ["_shared"] },
  _shared: { file: "assets/shared.js", css: ["assets/shared.css", "assets/app.css"] },
};

describe("official web launch HTML", () => {
  it("injects the active server, API proxy and extracted styles exactly once", () => {
    const html = renderOfficialWebHtml(template, manifest, "https://notes.example.test");
    expect(html).toContain('"INITIAL_SERVER_URL":"https://notes.example.test"');
    expect(html).toContain('"API_URL":"outline://app/api"');
    expect(html.match(/href="\/static\/assets\/app.css"/g)).toHaveLength(1);
    expect(html).toContain('/static/assets/shared.css');
    expect(html).toContain('/static/assets/index.js');
  });
  it("escapes script delimiters in profile data", () => {
    const html = renderOfficialWebHtml(template, manifest, "</script><script>alert(1)</script>");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("\\u003c/script>");
  });
  it("rejects a pre-rendered template instead of silently losing runtime config", () => {
    expect(() => renderOfficialWebHtml("<html/>", manifest, "")).toThrow("placeholder");
  });
});
