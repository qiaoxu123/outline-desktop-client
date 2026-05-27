import { ipcMain, BrowserWindow } from "electron";

const OUTLINE_URL = "https://notes.jlu-mcns.site";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth:loginWithBrowser", async () => {
    let authWindow: BrowserWindow | null = null;

    return new Promise((resolve) => {
      authWindow = new BrowserWindow({
        width: 900,
        height: 700,
        title: "Outline Login",
        webPreferences: {
          // Use default session to inherit proxy settings from commandLine
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const cleanup = () => {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
        }
        authWindow = null;
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve(fail("TIMEOUT", "Login timed out. Please try again.", true));
      }, 300_000); // 5 minutes

      // Handle page load failures
      authWindow.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, validatedURL) => {
          console.error("auth window load error:", errorCode, errorDescription, validatedURL);
          // Only fail if it's the initial load, not OIDC redirects
          if (validatedURL === OUTLINE_URL || validatedURL.startsWith(OUTLINE_URL)) {
            // ERR_CERT_AUTHORITY_INVALID, ERR_PROXY_CONNECTION_FAILED, etc.
            if (errorCode < 0) {
              clearTimeout(timeout);
              cleanup();
              resolve(
                fail(
                  "LOAD_ERROR",
                  `Failed to load login page: ${errorDescription}. Error code: ${errorCode}`,
                  true,
                ),
              );
            }
          }
        },
      );

      // Monitor navigation to detect successful login
      authWindow.webContents.on("did-navigate", async (_event, url: string) => {
        // After successful login, the user will be redirected to the Outline workspace
        // URL will be like https://notes.jlu-mcns.site/home or /doc/...
        if (
          url.startsWith(OUTLINE_URL) &&
          !url.includes("/auth/") &&
          !url.includes("/login")
        ) {
          try {
            const cookies = await authWindow!.webContents.session.cookies.get({
              url: OUTLINE_URL,
            });

            // Try to find the access token cookie
            const accessToken = cookies.find(
              (c) =>
                c.name === "accessToken" ||
                c.name === "idToken" ||
                c.name === "session",
            );

            if (accessToken) {
              clearTimeout(timeout);
              cleanup();
              resolve(
                ok({
                  token: accessToken.value,
                  cookieName: accessToken.name,
                }),
              );
              return;
            }

            // Try localStorage
            let localStorageToken: string | null = null;
            if (authWindow && !authWindow.isDestroyed()) {
              try {
                localStorageToken = await authWindow.webContents.executeJavaScript(
                  `
                  (function() {
                    try {
                      var keys = Object.keys(localStorage);
                      for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        if (k.indexOf('token') !== -1 || k.indexOf('session') !== -1 || k.indexOf('auth') !== -1) {
                          return localStorage.getItem(k);
                        }
                      }
                    } catch(e) {}
                    return null;
                  })()
                `,
                );
              } catch {
                // executeJavaScript may fail if page unloaded
              }
            }

            clearTimeout(timeout);
            cleanup();

            if (localStorageToken) {
              resolve(ok({ token: localStorageToken, cookieName: "localStorage" }));
            } else {
              // Fall back to using all cookies as a token string
              const cookieStr = cookies
                .map((c) => `${c.name}=${c.value}`)
                .join("; ");
              if (cookieStr) {
                resolve(ok({ token: cookieStr, cookieName: "cookies" }));
              } else {
                resolve(
                  fail(
                    "NO_TOKEN",
                    "Login succeeded but no auth token found. Please navigate to a document page in the browser before closing it.",
                  ),
                );
              }
            }
          } catch (err) {
            clearTimeout(timeout);
            cleanup();
            resolve(
              fail("ERROR", `Login error: ${err instanceof Error ? err.message : "Unknown"}`),
            );
          }
        }
      });

      authWindow.on("closed", () => {
        clearTimeout(timeout);
        authWindow = null;
        // If the promise hasn't resolved yet, it means the user closed without logging in
        resolve(fail("CANCELLED", "Login was cancelled"));
      });

      // Load Outline login page
      authWindow.loadURL(OUTLINE_URL).catch((err) => {
        clearTimeout(timeout);
        cleanup();
        resolve(
          fail("LOAD_ERROR", `Failed to load: ${err.message}`, true),
        );
      });
    });
  });
}
