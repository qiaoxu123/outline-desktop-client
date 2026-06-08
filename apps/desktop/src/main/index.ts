import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerProfileHandlers } from "./ipc/handlers/profiles";
import { registerCollectionHandlers } from "./ipc/handlers/collections";
import { registerDocumentHandlers } from "./ipc/handlers/documents";
import { registerAuthHandlers } from "./ipc/handlers/auth";

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
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
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

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
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
