import { ipcMain, net } from "electron";
import { z } from "zod";

/**
 * WebDAV storage for client-maintained app data (坚果云 / Jianguoyun).
 *
 * All data the desktop client keeps outside Outline's own document model lives
 * here under one app-data root, one subfolder per feature:
 *   5-共享/Outline桌面端/自测题库/  → quiz bank + per-user progress + interactions
 *   5-共享/Outline桌面端/论文库/    → paper likes/ratings (interactions.json)
 * Callers pass a path relative to the root, e.g. "论文库/interactions.json".
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
const DAV_ROOT = "5-共享/Outline桌面端";

const AUTH_HEADER =
  "Basic " + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString("base64");

function ok<T>(data: T) {
  return { ok: true as const, data };
}
function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Build a full URL from a path relative to DAV_BASE, per-segment encoded. */
function urlFor(rel: string): string {
  return `${DAV_BASE}/${rel
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;
}

/** A caller path is confined to the app root and may not escape it. */
function rootPath(path: string): string {
  return `${DAV_ROOT}/${path}`;
}
function isSafe(path: string): boolean {
  return !path.split("/").some((seg) => seg === ".." || seg === ".");
}

/** MKCOL each ancestor collection of a file so PUT never 409s on a missing
 * parent. Idempotent: 405/301 mean the collection already exists. */
async function ensureParents(fileRel: string): Promise<void> {
  const parts = fileRel.split("/").filter(Boolean);
  parts.pop(); // drop the filename
  let acc = "";
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg;
    try {
      await net.fetch(urlFor(acc) + "/", {
        method: "MKCOL",
        headers: { Authorization: AUTH_HEADER },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // best-effort; the PUT below surfaces any real failure
    }
  }
}

const GetSchema = z.object({ path: z.string().min(1) });
const PutSchema = z.object({ path: z.string().min(1), content: z.string() });

export function registerWebdavHandlers(): void {
  // Fetch a file's text; { found: false } on 404 (not an error).
  ipcMain.handle("webdav:get", async (_event, payload: unknown) => {
    const parsed = GetSchema.safeParse(payload);
    if (!parsed.success || !isSafe(parsed.data.path))
      return fail("VALIDATION", "invalid path");
    try {
      const res = await net.fetch(urlFor(rootPath(parsed.data.path)), {
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
    if (!parsed.success || !isSafe(parsed.data.path))
      return fail("VALIDATION", "invalid path");
    const rel = rootPath(parsed.data.path);
    try {
      await ensureParents(rel);
      const res = await net.fetch(urlFor(rel), {
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
