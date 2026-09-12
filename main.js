"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const runtime_1 = __importDefault(require("@todesktop/runtime"));
const DeepLinkHelper_1 = __importDefault(require("./utils/DeepLinkHelper"));
const AppWindow_1 = __importDefault(require("./AppWindow"));
const Manager_1 = __importDefault(require("./utils/Manager"));
const env_1 = __importDefault(require("./env"));
const Platform_1 = __importDefault(require("./utils/Platform"));
const Sentry = __importStar(require("@sentry/electron/main"));
const URLHelper_1 = __importDefault(require("./utils/URLHelper"));
const AppMenu_1 = __importDefault(require("./AppMenu"));
const deeplinks = new DeepLinkHelper_1.default();
let mainWindow;
const activeNotifications = new Set();
const autoUpdateDisabled = process.platform === "darwin"
    ? electron_1.systemPreferences.getUserDefault("AutoUpdateDisabled", "boolean")
    : false;
if (autoUpdateDisabled) {
    electron_log_1.default.info("Auto update disabled by user preference AutoUpdateDisabled=YES");
}
runtime_1.default.init({
    customLogger: electron_log_1.default,
    autoUpdater: !autoUpdateDisabled,
});
electron_log_1.default.info(`userData path: ${electron_1.app.getPath("userData")}`);
Sentry.init({
    dsn: env_1.default.SENTRY_DSN,
    environment: env_1.default.isDevelopment ? "development" : "production",
    release: `outline-desktop@${electron_1.app.getVersion()}`,
});
URLHelper_1.default.init();
AppMenu_1.default.init();
(_a = runtime_1.default.autoUpdater) === null || _a === void 0 ? void 0 : _a.on("update-downloaded", () => {
    const window = Manager_1.default.lastFocusedWindow || mainWindow;
    window === null || window === void 0 ? void 0 : window.webContents.send("update-downloaded");
});
function createWindow() {
    var _a, _b;
    const window = new AppWindow_1.default({
        url: (_b = (_a = deeplinks.urlThatLaunchedApp) !== null && _a !== void 0 ? _a : URLHelper_1.default.getLastUrl()) !== null && _b !== void 0 ? _b : env_1.default.host,
    });
    if (!mainWindow) {
        mainWindow = window;
    }
}
electron_1.ipcMain.handle("get-version", () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle("restart", () => {
    electron_1.app.relaunch();
    electron_1.app.exit(0);
});
electron_1.ipcMain.handle("check-for-updates", () => {
    var _a;
    (_a = runtime_1.default.autoUpdater) === null || _a === void 0 ? void 0 : _a.checkForUpdates();
});
electron_1.ipcMain.handle("restart-and-install", () => {
    var _a;
    (_a = runtime_1.default.autoUpdater) === null || _a === void 0 ? void 0 : _a.restartAndInstall();
});
electron_1.ipcMain.handle("titlebar-double-click", () => {
    var _a;
    (_a = Manager_1.default.lastFocusedWindow) === null || _a === void 0 ? void 0 : _a.doubleClickTitlebar();
});
// Used to be called "logout" but had to renamed after session management changed
// due to the previous implementation causing a logout loop.
electron_1.ipcMain.handle("logout-all-windows", () => {
    Manager_1.default.getAllWindows().forEach((window, index) => {
        if ((Manager_1.default.lastFocusedWindow && window === Manager_1.default.lastFocusedWindow) ||
            index === 0) {
            window.showAndFocus();
        }
        else {
            window.destroy();
        }
    });
});
electron_1.ipcMain.handle("set-spell-checker-languages", (_event, languages) => {
    Manager_1.default.getAllWindows().forEach((window) => {
        window.webContents.session.setSpellCheckerLanguages(window.webContents.session
            .getSpellCheckerLanguages()
            .filter((lang) => !languages.includes(lang)));
    });
});
electron_1.ipcMain.handle("set-notification-count", (_event, count) => {
    electron_1.app.setBadgeCount(count);
});
electron_1.ipcMain.handle("show-notification", (_event, options) => {
    if (!electron_1.Notification.isSupported()) {
        return;
    }
    const icon = options.iconDataUrl
        ? electron_1.nativeImage.createFromDataURL(options.iconDataUrl)
        : undefined;
    const notification = new electron_1.Notification({
        title: options.title,
        body: options.body,
        silent: options.silent,
        icon: (icon === null || icon === void 0 ? void 0 : icon.isEmpty()) ? undefined : icon,
    });
    // Retain the notification until it's closed or clicked, otherwise V8 may
    // GC it before the user interacts and the click listener is lost.
    activeNotifications.add(notification);
    notification.on("click", () => {
        const window = Manager_1.default.lastFocusedWindow || mainWindow;
        if (window) {
            window.showAndFocus();
            window.webContents.send("notification-clicked", {
                deeplink: options.deeplink,
                notificationId: options.notificationId,
            });
        }
    });
    notification.on("close", () => {
        activeNotifications.delete(notification);
    });
    notification.show();
});
electron_1.ipcMain.handle("get-auto-launch", () => {
    return electron_1.app.getLoginItemSettings().openAtLogin;
});
electron_1.ipcMain.handle("set-auto-launch", (_event, enabled) => {
    electron_1.app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
    });
    return electron_1.app.getLoginItemSettings().openAtLogin;
});
electron_1.ipcMain.handle("add-custom-host", (_event, host) => {
    URLHelper_1.default.addCustomHost(host);
});
electron_1.ipcMain.handle("clear-config", () => {
    URLHelper_1.default.clearConfig();
});
electron_1.ipcMain.handle("load-auth-config", (_event, host) => __awaiter(void 0, void 0, void 0, function* () {
    // Only allow https, except for http on localhost during development, to avoid
    // this acting as a general-purpose request proxy from the renderer.
    const url = new URL(host);
    const isLocalhost = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(env_1.default.isDevelopment && isLocalhost)) {
        throw new Error("Unsupported protocol");
    }
    // Fetched from the main process to bypass renderer CORS restrictions, with a
    // short timeout so an unreachable host fails fast.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const res = yield electron_1.net.fetch(`${url.origin}/api/auth.config`, {
            method: "POST",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`Unexpected response from host (${res.status})`);
        }
        const body = yield res.json();
        return body.data;
    }
    finally {
        clearTimeout(timeout);
    }
}));
electron_1.ipcMain.handle("history-back", () => {
    var _a;
    (_a = Manager_1.default.lastFocusedWindow) === null || _a === void 0 ? void 0 : _a.back();
});
electron_1.ipcMain.handle("history-forward", () => {
    var _a;
    (_a = Manager_1.default.lastFocusedWindow) === null || _a === void 0 ? void 0 : _a.forward();
});
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", function () {
        if (!electron_1.app.isReady()) {
            return;
        }
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow) {
            mainWindow.showAndFocus();
        }
        else {
            createWindow();
        }
    });
});
let hasFlushedCookies = false;
electron_1.app.on("before-quit", (event) => {
    Manager_1.default.isExiting = true;
    if (hasFlushedCookies) {
        return;
    }
    event.preventDefault();
    electron_log_1.default.info("Flushing cookies before quit");
    electron_1.session.defaultSession.cookies
        .flushStore()
        .then(() => electron_log_1.default.info("Flushed cookies before quit"))
        .catch((err) => electron_log_1.default.error("Failed to flush cookies on quit", err))
        .finally(() => {
        hasFlushedCookies = true;
        electron_1.app.quit();
    });
});
electron_1.app.on("window-all-closed", function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (!Platform_1.default.isMac()) {
        electron_1.app.quit();
    }
});
// When we receive an update-downloaded event then
// we forward that event to our UI using IPC
(_b = runtime_1.default.autoUpdater) === null || _b === void 0 ? void 0 : _b.on("update-downloaded", (event) => {
    mainWindow.webContents.send("update-downloaded", event);
});
// When user opts to install the update we should allow the app to exit
(_c = runtime_1.default.autoUpdater) === null || _c === void 0 ? void 0 : _c.on("before-quit-for-update", () => {
    Manager_1.default.isExiting = true;
});
