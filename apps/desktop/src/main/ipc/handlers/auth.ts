import { ipcMain, BrowserWindow, session } from "electron";
import { z } from "zod";

const OUTLINE_URL = "https://notes.jlu-mcns.site";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/**
 * Outline's email login is a magic-link flow:
 *   1. POST /auth/email { email }  → server emails a sign-in link
 *   2. GET  /auth/email.callback?token=… → server sets the `accessToken`
 *      session cookie and redirects into the workspace.
 *
 * In a desktop app the emailed link opens the user's *system browser*, not
 * our window — so the session never reaches the app. Instead we ask the user
 * to paste the link back into the app and we perform the callback exchange
 * ourselves in the main process, capturing the Set-Cookie `accessToken`
 * (a session JWT the Outline API accepts as a Bearer token).
 */

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
    "登录链接已过期或已被使用。请注意：邮件中的链接只能使用一次——如果你已在浏览器中点开过它，需要重新发送一封登录邮件。",
  "auth-error": "登录验证失败，请重新发送登录邮件后再试。",
  "suspended": "该账号已被停用，请联系管理员。",
};

/**
 * Perform the email.callback exchange, following same-origin redirects
 * manually so we can read the `accessToken` Set-Cookie on the 302.
 */
async function exchangeEmailToken(
  token: string,
): Promise<{ token: string } | { errorCode: string; message: string }> {
  let url = `${OUTLINE_URL}/auth/email.callback?token=${encodeURIComponent(token)}`;
  const cookieJar: string[] = [];

  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/json",
        ...(cookieJar.length ? { Cookie: cookieJar.join("; ") } : {}),
      },
    });

    const setCookies: string[] =
      (response.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const pair = cookie.split(";")[0];
      cookieJar.push(pair);
      const match = /^accessToken=(.+)$/.exec(pair);
      if (match && match[1]) {
        return { token: decodeURIComponent(match[1]) };
      }
    }

    const location = response.headers.get("location");
    if (!location) {
      // Terminal response without a session cookie
      if (response.status >= 400) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        return {
          errorCode: "CALLBACK_FAILED",
          message: body.message ?? `服务器返回 ${response.status}`,
        };
      }
      break;
    }

    const next = new URL(location, url);
    const notice = next.searchParams.get("notice");
    if (notice) {
      return {
        errorCode: "NOTICE",
        message: NOTICE_MESSAGES[notice] ?? `登录失败（${notice}）`,
      };
    }
    if (!next.toString().startsWith(OUTLINE_URL)) break; // don't follow off-site
    url = next.toString();
  }

  return {
    errorCode: "NO_TOKEN",
    message: "未能从服务器获取会话。链接可能无效，请重新发送登录邮件。",
  };
}

const EmailSchema = z.object({ email: z.string().email() });
const CompleteSchema = z.object({ input: z.string().min(1) });

export function registerAuthHandlers(): void {
  // Step 1: ask the server to email a magic sign-in link
  ipcMain.handle("auth:requestEmailLogin", async (_event, payload: unknown) => {
    const parsed = EmailSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "请输入有效的邮箱地址");
    }

    try {
      const response = await fetch(`${OUTLINE_URL}/auth/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        redirect?: string;
        message?: string;
      };

      if (!response.ok) {
        return fail(
          "EMAIL_REQUEST_FAILED",
          body.message ?? `发送失败（HTTP ${response.status}）`,
        );
      }

      // Some deployments redirect to an SSO provider instead of emailing
      if (body.redirect && body.redirect.includes("notice=")) {
        return fail("EMAIL_REQUEST_FAILED", "该邮箱无法使用邮件登录，请联系管理员。");
      }

      return ok({ sent: true });
    } catch (err) {
      return fail(
        "NETWORK",
        err instanceof Error ? err.message : "网络错误，请检查网络后重试",
      );
    }
  });

  // Step 2: exchange the pasted magic link for a session token
  ipcMain.handle("auth:completeEmailLogin", async (_event, payload: unknown) => {
    const parsed = CompleteSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "请粘贴邮件中的登录链接");
    }

    const token = extractEmailToken(parsed.data.input);
    if (!token) {
      return fail("INVALID_LINK", "无法识别登录链接，请完整复制邮件中的链接后重试。");
    }

    try {
      const result = await exchangeEmailToken(token);
      if ("token" in result) {
        return ok({ token: result.token, cookieName: "accessToken" });
      }
      return fail(result.errorCode, result.message);
    } catch (err) {
      return fail(
        "NETWORK",
        err instanceof Error ? err.message : "网络错误，请检查网络后重试",
      );
    }
  });

  ipcMain.handle("auth:loginWithBrowser", async () => {
    const ses = session.defaultSession;

    // Server is reachable directly — connect without a proxy, but accept its
    // cert (chain root may be absent from Chromium's bundled CA store).
    ses.setCertificateVerifyProc((_request, cb) => cb(0));

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

      const timeout = setTimeout(() => {
        if (!w.isDestroyed()) w.close();
        resolve(fail("TIMEOUT", "Login timed out (5 minutes)"));
      }, 300_000);

      w.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error("[auth] load fail:", code, desc, url);
        if (url === OUTLINE_URL || url === OUTLINE_URL + "/") {
          clearTimeout(timeout);
          if (!w.isDestroyed()) w.close();
          resolve(fail("LOAD_ERROR", `Page load failed: ${desc} (${code})`));
        }
      });

      w.webContents.on("did-finish-load", () => {
        console.log("[auth] page loaded:", w.webContents.getURL());
      });

      let settled = false;
      const handleNavigate = async (url: string) => {
        if (settled) return;
        // After login, the OIDC flow brings the user back to Outline workspace
        if (!url.startsWith(OUTLINE_URL)) return;
        // Still on auth page
        if (url.includes("/auth/")) return;

        // User is back on Outline workspace → login complete
        settled = true;
        try {
          const cookies = await ses.cookies.get({ url: OUTLINE_URL });

          const token = cookies.find(
            (c) => c.name === "accessToken" || c.name === "idToken",
          );

          if (token) {
            clearTimeout(timeout);
            if (!w.isDestroyed()) w.close();
            resolve(ok({ token: token.value, cookieName: token.name }));
            return;
          }

          // Try localStorage
          let localToken: string | null = null;
          if (!w.isDestroyed()) {
            try {
              localToken = await w.webContents.executeJavaScript(`
                (function(){
                  try{
                    var k=Object.keys(localStorage);
                    for(var i=0;i<k.length;i++){
                      if(k[i].indexOf('token')!==-1) return localStorage.getItem(k[i]);
                    }
                  }catch(e){}
                  return null;
                })()
              `);
            } catch {}
          }

          clearTimeout(timeout);
          if (!w.isDestroyed()) w.close();

          if (localToken) {
            resolve(ok({ token: localToken, cookieName: "localStorage" }));
          } else {
            const str = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
            if (str) {
              resolve(ok({ token: str, cookieName: "cookies" }));
            } else {
              resolve(fail("NO_TOKEN", "No auth token found. Please try again."));
            }
          }
        } catch (err) {
          clearTimeout(timeout);
          if (!w.isDestroyed()) w.close();
          resolve(fail("ERROR", err instanceof Error ? err.message : "Failed"));
        }
      };

      // Outline is a SPA: capture both full navigations (OIDC redirect back)
      // and in-page route changes (post-login client-side redirect).
      w.webContents.on("did-navigate", (_e, url: string) => handleNavigate(url));
      w.webContents.on("did-navigate-in-page", (_e, url: string) =>
        handleNavigate(url),
      );

      w.on("closed", () => {
        clearTimeout(timeout);
        authWindow = null;
        resolve(fail("CANCELLED", "Login window was closed"));
      });

      w.loadURL(OUTLINE_URL);
    });
  });
}
