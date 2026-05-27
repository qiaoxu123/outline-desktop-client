import { ipcMain, BrowserWindow, session } from "electron";

const OUTLINE_URL = "https://notes.jlu-mcns.site";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth:loginWithBrowser", async () => {
    const ses = session.fromPartition("auth-window", { cache: false });
    let authWindow: BrowserWindow | null = null;

    return new Promise((resolve) => {
      authWindow = new BrowserWindow({
        width: 900,
        height: 700,
        title: "Outline Login",
        webPreferences: {
          session: ses,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const timeout = setTimeout(() => {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
        }
        resolve(fail("TIMEOUT", "Login timed out", true));
      }, 180_000);

      authWindow.webContents.on(
        "did-navigate",
        async (_event: Electron.Event, url: string) => {
          if (
            url.startsWith(OUTLINE_URL) &&
            !url.includes("/auth/") &&
            !url.includes("/login")
          ) {
            try {
              const cookies = await ses.cookies.get({ url: OUTLINE_URL });
              const accessToken = cookies.find(
                (c) =>
                  c.name === "accessToken" ||
                  c.name === "idToken" ||
                  c.name === "session",
              );

              if (accessToken) {
                clearTimeout(timeout);
                if (authWindow && !authWindow.isDestroyed()) {
                  authWindow.close();
                }
                resolve(
                  ok({
                    token: accessToken.value,
                    cookieName: accessToken.name,
                  }),
                );
                return;
              }

              // Try localStorage extraction
              let localStorageToken: string | null = null;
              if (authWindow && !authWindow.isDestroyed()) {
                localStorageToken =
                  await authWindow.webContents.executeJavaScript(`
                    (function() {
                      try {
                        const keys = Object.keys(localStorage);
                        for (const k of keys) {
                          if (k.includes('token') || k.includes('session') || k.includes('auth')) {
                            return localStorage.getItem(k);
                          }
                        }
                      } catch(e) {}
                      return null;
                    })()
                  `);
              }

              clearTimeout(timeout);
              if (authWindow && !authWindow.isDestroyed()) {
                authWindow.close();
              }

              if (localStorageToken) {
                resolve(ok({ token: localStorageToken, cookieName: "localStorage" }));
              } else {
                const allCookies = cookies
                  .map((c) => `${c.name}=${c.value}`)
                  .join("; ");
                if (allCookies) {
                  resolve(ok({ token: allCookies, cookieName: "allCookies" }));
                } else {
                  resolve(
                    fail(
                      "NO_TOKEN",
                      "Could not find authentication token. Please log in and navigate to a document.",
                    ),
                  );
                }
              }
            } catch {
              resolve(fail("ERROR", "Login window closed unexpectedly"));
            }
          }
        },
      );

      authWindow.on("closed", () => {
        clearTimeout(timeout);
        authWindow = null;
      });

      authWindow.loadURL(OUTLINE_URL);
    });
  });
}
