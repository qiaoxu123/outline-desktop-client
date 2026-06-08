import { ipcMain, BrowserWindow, session, type Session } from "electron";
import { z } from "zod";

const OUTLINE_URL = "https://notes.jlu-mcns.site";

// Outline CSRF double-submit constants (shared/constants.ts in outline/outline)
const CSRF_COOKIE = "csrfToken";
const CSRF_HEADER = "x-csrf-token";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/**
 * Outline's email login (verified against outline/outline source):
 *
 *   1. POST /auth/email { email, preferOTP } — requires the CSRF double-submit
 *      (csrfToken cookie, issued on any GET, echoed in the x-csrf-token
 *      header). With preferOTP the server emails a 6-digit code; otherwise a
 *      magic link.
 *   2. GET /auth/email.callback — MUST include follow=true (links omit it to
 *      defeat mail-client prefetching). Accepts token=… (link) or
 *      code=…&email=…. On success it sets the `accessToken` session cookie
 *      (a JWT the API accepts as a Bearer token).
 *
 * All requests use `session.fetch` — Chromium's network stack with the
 * session cookie jar — the exact same path as the login BrowserWindow.
 * Node's undici fetch fails on some machines ("fetch failed") where
 * Chromium connects fine, and the jar handles Set-Cookie across redirects.
 */

function authSession(): Session {
  const ses = session.defaultSession;
  // Accept the server cert (chain root may be absent from the bundled CA store)
  ses.setCertificateVerifyProc((_request, cb) => cb(0));
  return ses;
}

async function getCookieValue(ses: Session, name: string): Promise<string | null> {
  const cookies = await ses.cookies.get({ url: OUTLINE_URL, name });
  return cookies[0]?.value ?? null;
}

/** Extract the sign-in token from a pasted magic link (or accept a raw token). */
function extractEmailToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Full URL pasted from the email
  try {
    const url = new URL(trimmed);
    const t = url.searchParams.get("token");
    if (t) return t;
  } catch {
    /* not a URL — fall through */
  }
  // Raw token (JWT-like, no whitespace)
  if (/^[\w.~-]+$/.test(trimmed)) return trimmed;
  // Token embedded in surrounding text
  const m = /[?&]token=([\w.~%-]+)/.exec(trimmed);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

const NOTICE_MESSAGES: Record<string, string> = {
  "expired-token":
    "登录链接已过期或已被使用（链接只能用一次，已在浏览器点开过就会失效）。请重新发送登录邮件。",
  "invalid-code": "验证码错误或已过期，请重新发送登录邮件获取新验证码。",
  "auth-error": "登录验证失败，请重新发送登录邮件后再试。",
  "user-suspended": "该账号已被停用，请联系管理员。",
  "suspended": "该账号已被停用，请联系管理员。",
};

const EmailSchema = z.object({ email: z.string().email() });
const CompleteSchema = z.object({
  input: z.string().min(1),
  email: z.string().email().optional(),
});

export function registerAuthHandlers(): void {
  // Step 1: ask the server to email a 6-digit code (or, on older servers
  // without OTP support, a magic sign-in link)
  ipcMain.handle("auth:requestEmailLogin", async (_event, payload: unknown) => {
    const parsed = EmailSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "请输入有效的邮箱地址");
    }

    const ses = authSession();

    try {
      // GET the site root so the server issues a csrfToken cookie into the jar
      await ses.fetch(`${OUTLINE_URL}/`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(15_000),
      });
      const csrf = await getCookieValue(ses, CSRF_COOKIE);

      // POST with the cookie jar (sends csrfToken) + header echo (double-submit)
      const response = await ses.fetch(`${OUTLINE_URL}/auth/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
        },
        body: JSON.stringify({ email: parsed.data.email, preferOTP: true }),
        signal: AbortSignal.timeout(15_000),
      });
      console.log("[auth] /auth/email status:", response.status);

      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        redirect?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        console.error("[auth] /auth/email failed:", response.status, body);
        return fail(
          "EMAIL_REQUEST_FAILED",
          body.message ?? body.error ?? `发送失败（HTTP ${response.status}）`,
        );
      }

      // The account uses an SSO provider — email sign-in not applicable
      if (body.redirect) {
        return fail(
          "SSO_REQUIRED",
          "该邮箱绑定了 SSO 登录，无法使用邮件验证码，请用浏览器窗口登录。",
        );
      }

      return ok({ sent: true });
    } catch (err) {
      console.error("[auth] /auth/email error:", err);
      return fail(
        "NETWORK",
        err instanceof Error ? err.message : "网络错误，请检查网络后重试",
      );
    }
  });

  // Step 2: exchange the 6-digit code (or pasted magic link) for a session
  ipcMain.handle("auth:completeEmailLogin", async (_event, payload: unknown) => {
    const parsed = CompleteSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "请输入邮件中的验证码或登录链接");
    }

    const input = parsed.data.input.trim();
    let qs: URLSearchParams | null = null;

    if (/^\d{6}$/.test(input)) {
      if (!parsed.data.email) {
        return fail("VALIDATION", "缺少邮箱地址，请返回上一步重新发送");
      }
      qs = new URLSearchParams({
        code: input,
        email: parsed.data.email,
        follow: "true",
      });
    } else {
      const token = extractEmailToken(input);
      if (token) qs = new URLSearchParams({ token, follow: "true" });
    }

    if (!qs) {
      return fail(
        "INVALID_INPUT",
        "无法识别输入。请输入邮件中的 6 位验证码，或完整粘贴登录链接。",
      );
    }

    const ses = authSession();

    try {
      // Drop any stale session cookie so the jar reflects only this attempt
      await ses.cookies.remove(OUTLINE_URL, "accessToken").catch(() => {});

      // Walk redirects manually: Chromium still records Set-Cookie on every
      // hop, but we only follow same-origin hops with a hard timeout per
      // request. (redirect:"follow" can hang indefinitely if the server's
      // post-login redirect target — its configured team URL — points
      // somewhere unreachable, which shows up as an infinite spinner.)
      let url = `${OUTLINE_URL}/auth/email.callback?${qs.toString()}`;
      let lastStatus = 0;
      let lastResponse: Response | null = null;

      for (let hop = 0; hop < 5; hop++) {
        console.log(`[auth] callback hop ${hop}: GET ${url}`);
        const response = await ses.fetch(url, {
          credentials: "include",
          redirect: "manual",
          cache: "no-store",
          headers: { Accept: "text/html,application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        lastStatus = response.status;
        lastResponse = response;
        console.log(`[auth] callback hop ${hop}: status ${response.status}`);

        // Session established? (jar is updated even on redirect responses)
        const token = await getCookieValue(ses, "accessToken");
        if (token) {
          console.log("[auth] accessToken acquired");
          return ok({ token, cookieName: "accessToken" });
        }

        const location = response.headers.get("location");
        if (!location) break;

        const next = new URL(location, url);
        console.log(`[auth] callback redirect -> ${next.toString()}`);

        const notice = next.searchParams.get("notice");
        if (notice) {
          const description = next.searchParams.get("description");
          return fail(
            "NOTICE",
            NOTICE_MESSAGES[notice] ??
              `登录失败（${notice}${description ? `: ${description}` : ""}）`,
          );
        }

        if (!next.toString().startsWith(OUTLINE_URL)) {
          console.warn("[auth] off-origin redirect, not following:", next.origin);
          break;
        }
        url = next.toString();
      }

      if (lastStatus >= 400 && lastResponse) {
        const body = (await lastResponse.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        return fail(
          "CALLBACK_FAILED",
          body.message ?? body.error ?? `服务器返回 ${lastStatus}`,
        );
      }

      return fail(
        "NO_TOKEN",
        "未能从服务器获取会话。验证码/链接可能已失效，请重新发送登录邮件。",
      );
    } catch (err) {
      console.error("[auth] email.callback error:", err);
      const msg = err instanceof Error ? err.message : "";
      return fail(
        "NETWORK",
        msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout")
          ? "服务器响应超时，请重试"
          : msg || "网络错误，请检查网络后重试",
      );
    }
  });

  // Fallback: interactive sign-in inside a BrowserWindow. Succeeds only when
  // a real `accessToken` session cookie appears — merely loading the login
  // page must NOT count as success.
  ipcMain.handle("auth:loginWithBrowser", async () => {
    const ses = authSession();

    let authWindow: BrowserWindow | null = new BrowserWindow({
      width: 900,
      height: 700,
      title: "Outline — Sign In",
      webPreferences: {
        session: ses,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    return new Promise((resolve) => {
      if (!authWindow) {
        resolve(fail("ERROR", "Failed to create window"));
        return;
      }

      const w = authWindow;
      let settled = false;

      const finish = (
        result:
          | { ok: true; data: { token: string; cookieName: string } }
          | { ok: false; error: { code: string; message: string } },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(poll);
        if (!w.isDestroyed()) w.close();
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish(fail("TIMEOUT", "登录超时（5 分钟），请重试"));
      }, 300_000);

      // The session cookie is the single source of truth for "signed in".
      const checkSession = async () => {
        if (settled) return;
        try {
          const token = await getCookieValue(ses, "accessToken");
          if (token) {
            finish(ok({ token, cookieName: "accessToken" }));
          }
        } catch {
          /* keep waiting */
        }
      };

      w.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error("[auth] load fail:", code, desc, url);
        if (url === OUTLINE_URL || url === OUTLINE_URL + "/") {
          finish(fail("LOAD_ERROR", `页面加载失败: ${desc} (${code})`));
        }
      });

      // Check after every navigation (OIDC redirects, SPA route changes) and
      // poll as a safety net — cookie writes can race navigation events.
      w.webContents.on("did-navigate", () => void checkSession());
      w.webContents.on("did-navigate-in-page", () => void checkSession());
      w.webContents.on("did-finish-load", () => void checkSession());
      const poll = setInterval(() => void checkSession(), 2_000);

      w.on("closed", () => {
        authWindow = null;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          clearInterval(poll);
          resolve(fail("CANCELLED", "登录窗口已关闭"));
        }
      });

      w.loadURL(OUTLINE_URL);
    });
  });
}
