import { ipcMain, net } from "electron";
import { z } from "zod";

/**
 * WebDAV storage for the self-test quiz (坚果云 / Jianguoyun).
 *
 * Routed through the main process because the renderer can't do WebDAV
 * (custom methods + Basic auth + external host) without hitting CORS.
 * Credentials are intentionally hardcoded per the project owner's request;
 * they are a Jianguoyun *app password* scoped to one shared folder, not the
 * account password. Note: anyone with the built app can extract them.
 */

const DAV_BASE = "https://dav.jianguoyun.com/dav";
const DAV_USER = "1728094659@qq.com";
const DAV_PASS = "aybxiymcadgqqe9s";
const DAV_DIR = "5-共享/outline自测题库";

const AUTH_HEADER =
  "Basic " + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString("base64");

function ok<T>(data: T) {
  return { ok: true as const, data };
}
function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Build the full URL for a file under the quiz dir, per-segment encoded. */
function davUrl(relPath: string): string {
  const segments = `${DAV_DIR}/${relPath}`
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent);
  return `${DAV_BASE}/${segments.join("/")}`;
}

const GetSchema = z.object({ path: z.string().min(1) });
const PutSchema = z.object({ path: z.string().min(1), content: z.string() });

export function registerWebdavHandlers(): void {
  // Fetch a file's text; { found: false } on 404 (not an error).
  ipcMain.handle("webdav:get", async (_event, payload: unknown) => {
    const parsed = GetSchema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION", "path required");
    try {
      const res = await net.fetch(davUrl(parsed.data.path), {
        headers: { Authorization: AUTH_HEADER },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) return ok({ found: false, content: null });
      if (!res.ok) return fail("HTTP", `WebDAV GET ${res.status}`);
      return ok({ found: true, content: await res.text() });
    } catch (err) {
      return fail("NETWORK", err instanceof Error ? err.message : "网络错误");
    }
  });

  // Upsert a file. Jianguoyun returns 201 (created) or 204 (overwritten).
  ipcMain.handle("webdav:put", async (_event, payload: unknown) => {
    const parsed = PutSchema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION", "path and content required");
    try {
      const res = await net.fetch(davUrl(parsed.data.path), {
        method: "PUT",
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: parsed.data.content,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return fail("HTTP", `WebDAV PUT ${res.status}`);
      return ok({ status: res.status });
    } catch (err) {
      return fail("NETWORK", err instanceof Error ? err.message : "网络错误");
    }
  });
}
