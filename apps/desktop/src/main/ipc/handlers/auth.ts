import { ipcMain, BrowserWindow, session } from "electron";

const OUTLINE_URL = "https://notes.jlu-mcns.site";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth:loginWithBrowser", async () => {
    const ses = session.defaultSession;

    // Configure proxy on the default session
    await ses.setProxy({ proxyRules: "http://127.0.0.1:7897" });

    // Allow all certs
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

      w.webContents.on("did-navigate", async (_e, url: string) => {
        // After login, the OIDC flow brings the user back to Outline workspace
        if (!url.startsWith(OUTLINE_URL)) return;
        // Still on auth page
        if (url.includes("/auth/")) return;

        // User is back on Outline workspace → login complete
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
      });

      w.on("closed", () => {
        clearTimeout(timeout);
        authWindow = null;
        resolve(fail("CANCELLED", "Login window was closed"));
      });

      w.loadURL(OUTLINE_URL);
    });
  });
}
