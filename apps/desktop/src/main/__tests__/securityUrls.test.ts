import { describe, expect, it } from "vitest";
import {
  sameServerOrigin,
  safeExternalUrl,
  shouldAttachOutlineToken,
} from "../securityUrls";

describe("Outline network security policy", () => {
  const server = "https://notes.example.test:224";

  it("requires an exact scheme, host, and port", () => {
    expect(sameServerOrigin(server + "/api/attachments.redirect", server)).toBe(true);
    expect(sameServerOrigin("https://notes.example.test:225/api/attachments.redirect", server)).toBe(false);
    expect(sameServerOrigin("https://notes.example.test.evil.test/api/attachments.redirect", server)).toBe(false);
    expect(sameServerOrigin("http://notes.example.test:224/api/attachments.redirect", server)).toBe(false);
    expect(sameServerOrigin("not-a-url", server)).toBe(false);
  });

  it("limits token injection to first-party attachment redirects", () => {
    expect(shouldAttachOutlineToken(server + "/api/attachments.redirect?id=1", server)).toBe(true);
    expect(shouldAttachOutlineToken(server + "/api/auth.info", server)).toBe(false);
    expect(shouldAttachOutlineToken(server + "/login", server)).toBe(false);
    expect(shouldAttachOutlineToken("https://notes.example.test.evil.test/api/attachments.redirect", server)).toBe(false);
  });

  it("rejects non-web or privileged external protocols", () => {
    expect(safeExternalUrl("https://example.test/docs")).toBe(true);
    expect(safeExternalUrl("mailto:test@example.test")).toBe(true);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "about:blank"]) {
      expect(safeExternalUrl(url)).toBe(false);
    }
  });
});
