import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
} from "electron";
import { join, normalize, relative } from "path";
import { readFile } from "fs/promises";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { setFetchImplementation } from "@outline/api-client";
import {
  findProfile,
  readActiveProfileId,
  readProfiles,
  writeActiveProfileId,
} from "./services/storage/profiles";
import { registerProfileHandlers } from "./ipc/handlers/profiles";
import { registerCollectionHandlers } from "./ipc/handlers/collections";
import { registerDocumentHandlers } from "./ipc/handlers/documents";
import { registerAuthHandlers } from "./ipc/handlers/auth";
import { registerApiHandlers } from "./ipc/handlers/api";
import { registerPersonalNotesHandlers } from "./ipc/handlers/personalNotes";
import { registerWebdavHandlers } from "./ipc/handlers/webdav";
import { registerAttachmentHandlers } from "./ipc/handlers/attachments";
import { registerAiHandlers } from "./ipc/handlers/ai";

// Keep TLS verification enabled. A profile that uses a private CA should
// install that CA in the operating system trust store rather than disabling
// certificate validation for the whole Electron process.

function registerAllIpcHandlers(): void {
  registerProfileHandlers();
  registerCollectionHandlers();
  registerDocumentHandlers();
  registerAuthHandlers();
  registerApiHandlers();
  registerPersonalNotesHandlers();
  registerWebdavHandlers();
  registerAttachmentHandlers();
  registerAiHandlers();

  // Windows: recolor the native window-controls overlay when the app theme
  // changes so min/max/close blend with the (custom) titlebar background.
  ipcMain.on(
    "win:setTitleBarOverlay",
    (e, overlay: { color: string; symbolColor: string }) => {
      if (process.platform !== "win32") return;
      const win = BrowserWindow.fromWebContents(e.sender);
      try {
        win?.setTitleBarOverlay?.({
          color: overlay.color,
          symbolColor: overlay.symbolColor,
          height: 48,
        });
      } catch {
        // overlay only exists when the window was created with titleBarOverlay
      }
    },
  );

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

  ipcMain.handle("desktop:getActiveProfile", () => readActiveProfileId());
  ipcMain.handle("desktop:setActiveProfile", (_event, id: unknown) => {
    if (typeof id !== "string" || !findProfile(id)) return { ok: false };
    writeActiveProfileId(id);
    return { ok: true };
  });
  ipcMain.handle("desktop:setActiveProfileByHost", (_event, host: unknown) => {
    if (typeof host !== "string") return { ok: false };
    try {
      const origin = new URL(host).origin;
      const profile = readProfiles().find((item) => new URL(item.serverUrl).origin === origin);
      if (!profile) return { ok: false };
      writeActiveProfileId(profile.id);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
  ipcMain.handle("desktop:loadAuthConfig", async (_event, host: unknown) => {
    if (typeof host !== "string") throw new Error("Invalid host");
    const origin = new URL(host).origin;
    const response = await net.fetch(`${origin}/api/auth.config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(`Unable to load auth config (${response.status})`);
    return response.json();
  });
  ipcMain.handle("desktop:logout", () => {
    writeActiveProfileId(null);
    return { ok: true };
  });
  ipcMain.on("desktop:history", (event, direction: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (direction === "back") win?.webContents.goBack();
    if (direction === "forward") win?.webContents.goForward();
  });

  ipcMain.handle("desktop:titlebarDoubleClick", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

}

const officialScheme = "outline";

protocol.registerSchemesAsPrivileged([
  {
    scheme: officialScheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function officialWebRoot(): string {
  if (is.dev) {
    return join(__dirname, "../../../vendor/outline-web/build/app");
  }
  return join(__dirname, "../official-web");
}

function activeProfile() {
  const id = readActiveProfileId();
  return id ? findProfile(id) : undefined;
}

async function officialIndex(): Promise<Response> {
  const root = officialWebRoot();
  const template = await readFile(join(root, "index.html"), "utf8");
  const profile = activeProfile();
  const serverUrl = profile?.serverUrl ?? "";
  const environment = {
    ENVIRONMENT: "production",
    URL: "outline://app",
    CDN_URL: "outline://app",
    VERSION: "desktop",
    DEFAULT_LANGUAGE: "zh_CN",
    analytics: [],
    ENABLE_UPDATES: false,
    ...({} as Record<string, unknown>),
  };
  const manifest = JSON.parse(
    await readFile(join(root, ".vite/manifest.json"), "utf8"),
  ) as Record<string, { file: string }>;
  const entry = manifest["app/index.tsx"]?.file;
  if (!entry) return new Response("Official Web manifest entry missing", { status: 500 });
  const html = template
    .replace("{lang}", "zh-CN")
    .replace("{title}", "Outline")
    .replace("{description}", "Outline")
      .replace("{cdn-url}", "outline://app")
    .replace("{head-tags}", "")
    .replace(
      "{env}",
    `<script>window.env=${JSON.stringify({ ...environment, API_URL: "outline://app/api", INITIAL_SERVER_URL: serverUrl })}</script>`,
    )
    .replace("{script-tags}", `<script type="module" src="/static/${entry}"></script>`)
    .replace("{content}", "");
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleOfficialRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const profile = activeProfile();
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return officialIndex();
  }

  if (url.pathname.startsWith("/api/")) {
    if (!profile?.serverUrl || !profile.apiKey) {
      return new Response("No active Outline profile", { status: 401 });
    }
    const target = new URL(url.pathname + url.search, profile.serverUrl);
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${profile.apiKey}`);
    headers.delete("host");
    const upstream = await net.fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    });
    return upstream;
  }

  const root = officialWebRoot();
  const assetPath = url.pathname.startsWith("/static/")
    ? url.pathname.slice("/static/".length)
    : url.pathname.slice(1);
  const requested = normalize(join(root, assetPath));
  const safeRelative = relative(root, requested);
  const filePath = safeRelative.startsWith("..") ? join(root, "index.html") : requested;
  try {
    const body = await readFile(filePath);
    const contentType = filePath.endsWith(".js")
      ? "text/javascript"
      : filePath.endsWith(".css")
        ? "text/css"
        : filePath.endsWith(".woff2")
          ? "font/woff2"
          : "application/octet-stream";
    return new Response(body, { headers: { "content-type": contentType } });
  } catch {
    return officialIndex();
  }
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Hide the native File/Edit/View/Window menu bar (Windows/Linux) — it's
    // redundant with the app's own toolbar and looks cluttered. Alt still
    // reveals it, and its accelerators (Ctrl+C/V etc.) keep working.
    autoHideMenuBar: true,
    // macOS: inset traffic lights. Windows: frameless with a native window-
    // controls overlay (min/max/close top-right, themed) so the top matches the
    // macOS single-row look instead of a native title bar + menu. Linux keeps
    // the native frame.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : process.platform === "win32"
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: {
              color: nativeTheme.shouldUseDarkColors ? "#111319" : "#ffffff",
              symbolColor: nativeTheme.shouldUseDarkColors
                ? "#e6e6e6"
                : "#111319",
              height: 48,
            },
          }
        : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
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

  // The official Outline Web bundle is the only renderer in every mode. The
  // local React 19 prototype is intentionally not loaded by Electron.
  void mainWindow.loadURL(`${officialScheme}://app/`);

  return mainWindow;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.outline.desktop");

  // Restore the last explicit profile selection. Existing installations that
  // predate active-profile persistence get a one-time initial selection.
  if (!readActiveProfileId()) {
    const firstProfile = readProfiles()[0];
    if (firstProfile) writeActiveProfileId(firstProfile.id);
  }

  // This Outline instance currently serves a certificate chain whose issuer
  // is not present in the macOS/Electron trust store. Chromium rejects it on
  // every fresh process, even though the configured server is reachable.
  // Allow only this exact, user-configured profile origin and only the missing
  // issuer error; all other certificate failures remain rejected.
  app.on("certificate-error", (event, _webContents, url, error, _certificate, callback) => {
    let knownProfileOrigin = false;
    try {
      const requestOrigin = new URL(url).origin;
      knownProfileOrigin = readProfiles().some(
        (profile) => new URL(profile.serverUrl).origin === requestOrigin,
      );
    } catch {
      // Malformed URLs are never trusted.
    }
    if (knownProfileOrigin && error === "net::ERR_CERT_AUTHORITY_INVALID") {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });

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
  protocol.handle(officialScheme, handleOfficialRequest);
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
