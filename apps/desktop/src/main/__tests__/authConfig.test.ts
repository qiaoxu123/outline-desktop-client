import { describe, expect, it, vi } from "vitest";
import { loadDesktopAuthConfig } from "../authConfig";

describe("desktop workspace auth configuration", () => {
  it("unwraps Outline RPC data and preserves the custom HTTPS port", async () => {
    const config = { name: "Team", providers: [{ id: "email" }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: config }));
    await expect(loadDesktopAuthConfig("https://notes.jlu-mcns.site:224/", fetcher))
      .resolves.toEqual(config);
    expect(fetcher).toHaveBeenCalledWith(
      "https://notes.jlu-mcns.site:224/api/auth.config",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("accepts an already unwrapped compatible bridge response", async () => {
    const config = { providers: [] };
    const fetcher = vi.fn().mockResolvedValue(Response.json(config));
    await expect(loadDesktopAuthConfig("http://localhost:3000", fetcher))
      .resolves.toEqual(config);
  });

  it.each([null, [], {}, { data: null }, { data: { providers: "email" } }])(
    "rejects malformed configuration %j",
    async (payload) => {
      const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
      await expect(loadDesktopAuthConfig("https://example.test", fetcher))
        .rejects.toThrow("not an Outline installation");
    },
  );

  it("does not accept an HTTP failure containing providers", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ data: { providers: [] } }, { status: 503 }),
    );
    await expect(loadDesktopAuthConfig("https://example.test", fetcher))
      .rejects.toThrow("(503)");
  });

  it("propagates network errors instead of reporting success", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    await expect(loadDesktopAuthConfig("https://example.test", fetcher))
      .rejects.toThrow("Network unavailable");
  });

  it("rejects non-HTTP hosts before requesting them", async () => {
    const fetcher = vi.fn();
    await expect(loadDesktopAuthConfig("file:///tmp/config", fetcher))
      .rejects.toThrow("Invalid Outline host");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
