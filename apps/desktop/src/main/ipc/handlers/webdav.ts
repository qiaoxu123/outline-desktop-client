import { ipcMain, net } from "electron";
import { z } from "zod";
import {
  readWebdavCredentials, webdavCredentialStatus,
  writeWebdavCredentials, clearWebdavCredentials,
} from "../../services/storage/webdavCredentials";

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
 * Credentials are saved through the operating system encryption service;
 * never put a shared app password into this source repository or installer.
 */

const DAV_BASE = "https://dav.jianguoyun.com/dav";
const DAV_ROOT = "5-共享/Outline桌面端";
// Avoid repeated MKCOL requests on every quiz/note/interaction save.
const knownDirectories = new Set<string>();

function authenticationHeader(): string | null {
  const credentials = readWebdavCredentials();
  return credentials
    ? "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")
    : null;
}

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
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((seg) =>
    seg.length > 0 && seg !== "." && seg !== ".." &&
    !/%2e|%2f|%5c/i.test(seg),
  );
}

/** MKCOL each ancestor collection of a file so PUT never 409s on a missing
 * parent. Idempotent: 405/301 mean the collection already exists. */
async function ensureParents(fileRel: string, authorization: string): Promise<void> {
  const parts = fileRel.split("/").filter(Boolean);
  parts.pop(); // drop the filename
  let acc = "";
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg;
    if (knownDirectories.has(acc)) continue;
    try {
      const response = await net.fetch(urlFor(acc) + "/", {
        method: "MKCOL",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(15_000),
      });
      // 405 means the collection already exists.
      if (response.ok || response.status === 405) knownDirectories.add(acc);
    } catch {
      // best-effort; the PUT below surfaces any real failure
    }
  }
}

const GetSchema = z.object({ path: z.string().min(1) });
const PutSchema = z.object({ path: z.string().min(1), content: z.string() });
const CredentialsSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

export function registerWebdavHandlers(): void {
  ipcMain.handle("webdav:status", () => ok(webdavCredentialStatus()));

  ipcMain.handle("webdav:setCredentials", (_event, payload: unknown) => {
    const parsed = CredentialsSchema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION", "请输入有效的 WebDAV 用户名和应用密码");
    try {
      writeWebdavCredentials(parsed.data);
      return ok(webdavCredentialStatus());
    } catch (error) {
      return fail("STORAGE", error instanceof Error ? error.message : "无法安全保存凭据");
    }
  });

  ipcMain.handle("webdav:clearCredentials", () => {
    try {
      clearWebdavCredentials();
      return ok(webdavCredentialStatus());
    } catch (error) {
      return fail("STORAGE", error instanceof Error ? error.message : "无法清除凭据");
    }
  });

  // Fetch a file's text; { found: false } on 404 (not an error).
  ipcMain.handle("webdav:get", async (_event, payload: unknown) => {
    const parsed = GetSchema.safeParse(payload);
    if (!parsed.success || !isSafe(parsed.data.path))
      return fail("VALIDATION", "invalid path");
    const authorization = authenticationHeader();
    if (!authorization) return fail("NOT_CONFIGURED", "请先在桌面偏好设置中配置 WebDAV");
    try {
      const res = await net.fetch(urlFor(rootPath(parsed.data.path)), {
        headers: { Authorization: authorization },
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
    const authorization = authenticationHeader();
    if (!authorization) return fail("NOT_CONFIGURED", "请先在桌面偏好设置中配置 WebDAV");
    const rel = rootPath(parsed.data.path);
    try {
      await ensureParents(rel, authorization);
      const upload = () => net.fetch(urlFor(rel), {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: parsed.data.content,
        signal: AbortSignal.timeout(20_000),
      });
      let res = await upload();
      if (res.status === 409) {
        // Parent may have been removed on another device; rebuild once.
        knownDirectories.clear();
        await ensureParents(rel, authorization);
        res = await upload();
      }
      if (!res.ok) return fail("HTTP", `WebDAV PUT ${res.status}`);
      return ok({ status: res.status });
    } catch (err) {
      return fail("NETWORK", err instanceof Error ? err.message : "网络错误");
    }
  });
}
