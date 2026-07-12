import { app, BrowserWindow, ipcMain, net, session, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { setFetchImplementation } from "@outline/api-client";
import { readProfiles } from "./services/storage/profiles";
import { registerProfileHandlers } from "./ipc/handlers/profiles";
import { registerCollectionHandlers } from "./ipc/handlers/collections";
import { registerDocumentHandlers } from "./ipc/handlers/documents";
import { registerAuthHandlers } from "./ipc/handlers/auth";
import { registerApiHandlers } from "./ipc/handlers/api";
import { registerPersonalNotesHandlers } from "./ipc/handlers/personalNotes";

// The Outline server (notes.jlu-mcns.site) is a domestic host reachable
// directly — it must NOT be routed through a general-purpose proxy. We only
// relax TLS verification because the server cert's chain root may be absent
// from Node's / Chromium's bundled CA store.
//
// Node.js fetch (main-process API calls): relax cert verification.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Chromium (login BrowserWindow): accept the server cert. No proxy override —
// Chromium connects directly. Set OUTLINE_PROXY to opt into a proxy for the
// API transport if the network ever requires it.
app.commandLine.appendSwitch("ignore-certificate-errors");

function registerAllIpcHandlers(): void {
  registerProfileHandlers();
  registerCollectionHandlers();
  registerDocumentHandlers();
  registerAuthHandlers();
  registerApiHandlers();
  registerPersonalNotesHandlers();

  // Attachment download: Chromium's downloader gets the Authorization header
  // from the webRequest hook above, so a plain downloadURL just works and
  // shows the native save dialog.
  ipcMain.handle("attachments:download", (event, { url }: { url: string }) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return { ok: false, error: "invalid url" };
    }
    const isKnownServer = readProfiles().some((p) => url.startsWith(p.serverUrl));
    if (!isKnownServer) return { ok: false, error: "unknown server" };
    event.sender.downloadURL(url);
    return { ok: true };
  });
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // hiddenInset/trafficLightPosition are macOS-only; Windows/Linux keep the
    // native frame so window controls (minimize/maximize/close) work normally.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // in-app forum panel (features/forum) embeds the site via <webview>
      webviewTag: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Surface renderer logs/crashes in the dev terminal — a renderer exception
  // otherwise produces a silent white window with nothing in the terminal.
  if (is.dev) {
    mainWindow.webContents.on(
      "console-message",
      (event: unknown, ...args: unknown[]) => {
        const e = event as { level?: number | string; message?: string };
        const message =
          typeof e?.message === "string" ? e.message : String(args[1] ?? "");
        console.log("[renderer]", message);
      },
    );
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] process gone:", details.reason);
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.outline.desktop");

  // Route ALL Outline API calls through Chromium's network stack (net.fetch)
  // instead of Node's undici fetch. On some machines undici fails with
  // "fetch failed" (TLS chain / DNS / IPv6 differences) while Chromium —
  // which demonstrably loads the login window — connects fine.
  setFetchImplementation(
    ((input: RequestInfo | URL, init?: RequestInit) =>
      net.fetch(input as string, init)) as typeof fetch,
  );

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Links inside embedded webviews (forum) open in the system browser,
  // same policy as the main window.
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") {
      contents.setWindowOpenHandler((details) => {
        void shell.openExternal(details.url);
        return { action: "deny" };
      });
    }
  });

  // Document images are served by the Outline server behind authentication
  // (`/api/attachments.redirect`), but <img> tags can't send an Authorization
  // header — inject the matching profile's Bearer token for renderer requests
  // to any known server. Profiles are re-read per request (cheap local JSON)
  // so newly added profiles work without a restart.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const profile = readProfiles().find((p) =>
        details.url.startsWith(p.serverUrl),
      );
      if (profile?.apiKey && !details.requestHeaders["Authorization"]) {
        details.requestHeaders["Authorization"] = `Bearer ${profile.apiKey}`;
      }
    } catch {
      // never block the request over a profile read failure
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  registerAllIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
