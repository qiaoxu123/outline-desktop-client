"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_window_state_1 = __importDefault(require("electron-window-state"));
const electron_context_menu_1 = __importDefault(require("electron-context-menu"));
const path_1 = __importDefault(require("path"));
const Manager_1 = __importDefault(require("./utils/Manager"));
const Platform_1 = __importDefault(require("./utils/Platform"));
const URLHelper_1 = __importDefault(require("./utils/URLHelper"));
const electron_log_1 = __importDefault(require("electron-log"));
const env_1 = __importDefault(require("./env"));
const LOADING_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-app-region: drag;
    user-select: none;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #111319; color: #999; }
  }
  @media (prefers-color-scheme: light) {
    body { background: #fff; color: #999; }
  }
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .spinner {
    width: 24px;
    height: 24px;
    border: 2.5px solid rgba(128,128,128,0.15);
    border-top-color: rgba(128,128,128,0.5);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .message {
    margin-top: 16px;
    font-size: 13px;
  }
</style>
</head>
<body><div class="container">
  <div class="spinner"></div>
  <div class="message">Connecting\u2026</div>
</div></body>
</html>`;
const LOADING_URL = "data:text/html;charset=utf-8," + encodeURIComponent(LOADING_HTML);
class AppWindow extends electron_1.BrowserWindow {
    constructor(_a) {
        var { url } = _a, options = __rest(_a, ["url"]);
        const windowState = (0, electron_window_state_1.default)({
            defaultWidth: 1000,
            defaultHeight: 800,
            fullScreen: false,
            file: env_1.default.isDevelopment
                ? "window-state.development.json"
                : "window-state.json",
        });
        super(Object.assign({ x: windowState.x, y: windowState.y, width: windowState.width, height: windowState.height, minWidth: 740, minHeight: 400, titleBarStyle: Platform_1.default.isMac() ? "hiddenInset" : "default",
            // This position precisely matches Mimestream, NetNewsWire native apps
            trafficLightPosition: Platform_1.default.isMac() ? { x: 19, y: 18 } : undefined,
            // Hides the menu with File etc on Windows
            autoHideMenuBar: true, backgroundColor: electron_1.nativeTheme.shouldUseDarkColors ? "#1b1d21" : "#f9f9f9", show: false, webPreferences: {
                spellcheck: true,
                scrollBounce: true,
                textAreasAreResizable: false,
                contextIsolation: true,
                nodeIntegration: false,
                nodeIntegrationInWorker: false,
                preload: path_1.default.join(__dirname, "preload.js"),
            } }, options));
        this.retryTimer = null;
        this.handleWindowOpen = ({ url, disposition, }) => {
            const isCmdClick = disposition === "background-tab";
            if (URLHelper_1.default.isInternal(url, this.webContents.getURL()) && isCmdClick) {
                const bounds = this.getBounds();
                new AppWindow({
                    url: URLHelper_1.default.addQueryParams(url, { sidebarHidden: "true" }),
                    x: bounds.x + 20,
                    y: bounds.y + 20,
                    width: bounds.width,
                    height: bounds.height,
                });
                return { action: "deny" };
            }
            electron_1.shell.openExternal(url);
            return { action: "deny" };
        };
        this.handleNavigation = (event, targetUrl) => {
            if (URLHelper_1.default.isExternal(targetUrl, this.webContents.getURL())) {
                event.preventDefault();
                void electron_1.shell.openExternal(targetUrl);
                return false;
            }
            return true;
        };
        this.targetUrl = url.startsWith("data:") ? env_1.default.host : url;
        this.loadURL(this.targetUrl);
        Manager_1.default.lastFocusedWindow = this;
        Manager_1.default.addWindow(this);
        // Hook up contextual menus in this window
        (0, electron_context_menu_1.default)({
            window: this,
            showSaveImageAs: true,
        });
        // Hook up window state management
        windowState.manage(this);
        // Show the window to user once loaded (we start hidden)
        this.once("ready-to-show", () => {
            const zoomLevel = URLHelper_1.default.getZoomLevel();
            if (zoomLevel !== 0) {
                this.webContents.setZoomLevel(zoomLevel);
            }
            this.showAndFocus();
        });
        // Persist zoom level changes from pinch/wheel zoom
        this.webContents.on("zoom-changed", () => {
            URLHelper_1.default.setZoomLevel(this.webContents.getZoomLevel());
        });
        // Navigation events on touchpad swipe
        this.on("swipe", (_, direction) => {
            var _a, _b;
            if (direction === "right" &&
                ((_a = this.webContents) === null || _a === void 0 ? void 0 : _a.navigationHistory.canGoForward())) {
                this.webContents.navigationHistory.goForward();
            }
            else if (direction === "left" &&
                ((_b = this.webContents) === null || _b === void 0 ? void 0 : _b.navigationHistory.canGoBack())) {
                this.webContents.navigationHistory.goBack();
            }
        });
        // Navigation events on mouse back/forward buttons
        this.on("app-command", (_, cmd) => {
            var _a, _b;
            if (cmd === "browser-forward" &&
                ((_a = this.webContents) === null || _a === void 0 ? void 0 : _a.navigationHistory.canGoForward())) {
                this.webContents.navigationHistory.goForward();
            }
            else if (cmd === "browser-backward" &&
                ((_b = this.webContents) === null || _b === void 0 ? void 0 : _b.navigationHistory.canGoBack())) {
                this.webContents.navigationHistory.goBack();
            }
        });
        // Handle close events as this is usually a hide on macOS
        this.on("close", (event) => {
            URLHelper_1.default.setZoomLevel(this.webContents.getZoomLevel());
            const url = this.webContents.getURL();
            URLHelper_1.default.setLastUrl(url.startsWith("data:") ? this.targetUrl : url);
            if (Manager_1.default.isExiting) {
                return;
            }
            const lastWindow = Manager_1.default.getAllWindows().length <= 1;
            if (Platform_1.default.isMac() && !this.isFullScreen() && lastWindow) {
                event.preventDefault();
                this.hide();
            }
            if (this.isFullScreen()) {
                event.preventDefault();
                this.once("leave-full-screen", this.hide);
                this.setFullScreen(false);
            }
        });
        // Send focus events to renderer so that the visual can be adjusted when backgrounded
        this.on("focus", () => {
            Manager_1.default.lastFocusedWindow = this;
            this.webContents.send("focus");
        });
        this.on("blur", () => {
            this.webContents.send("blur");
        });
        this.on("closed", () => {
            this.stopRetrying();
            if (Manager_1.default.lastFocusedWindow === this) {
                Manager_1.default.lastFocusedWindow = undefined;
            }
            Manager_1.default.removeWindow(this);
        });
        // Internal page navigation/redirects
        this.webContents.on("will-navigate", this.handleNavigation);
        // Send navigation state to renderer after navigation events
        this.webContents.on("did-navigate", () => this.sendNavigationState());
        this.webContents.on("did-navigate-in-page", () => this.sendNavigationState());
        // Recover from renderer crashes
        this.webContents.on("render-process-gone", (_event, details) => {
            if (details.reason === "clean-exit") {
                return;
            }
            electron_1.dialog
                .showMessageBox(this, {
                type: "error",
                title: "Page Unresponsive",
                message: "The page has crashed. Would you like to reload?",
                buttons: ["Reload", "Close"],
                defaultId: 0,
            })
                .then(({ response }) => {
                if (response === 0) {
                    this.webContents.reload();
                }
                else {
                    this.close();
                }
            });
        });
        // Recover from unresponsive renderer
        this.on("unresponsive", () => {
            electron_1.dialog
                .showMessageBox(this, {
                type: "warning",
                title: "Page Unresponsive",
                message: "The page is not responding. Would you like to reload?",
                buttons: ["Reload", "Wait"],
                defaultId: 0,
            })
                .then(({ response }) => {
                if (response === 0) {
                    this.webContents.reload();
                }
            });
        });
        // Handle page load failures (offline, DNS errors, timeouts, etc.)
        this.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            electron_log_1.default.info(`did-fail-load: ${validatedURL} (code: ${errorCode}, ${errorDescription}, mainFrame: ${isMainFrame})`);
            // Ignore subframe failures and aborted navigations
            if (!isMainFrame || errorCode === -3)
                return;
            electron_log_1.default.warn(`Page load failed: ${validatedURL} (code: ${errorCode}, ${errorDescription})`);
            this.loadURL(LOADING_URL);
            electron_log_1.default.info("Loading URL called, about to schedule retry");
            this.scheduleRetry();
        });
        this.webContents.on("did-finish-load", () => {
            const currentUrl = this.webContents.getURL();
            electron_log_1.default.info(`Page loaded: ${currentUrl}`);
            if (currentUrl.startsWith("data:")) {
                // On the loading page — ensure retries are running
                if (!this.retryTimer) {
                    electron_log_1.default.info("On loading page with no active retry, scheduling retry");
                    this.scheduleRetry();
                }
            }
            else if (this.retryTimer) {
                electron_log_1.default.info("Target URL loaded successfully, stopping retries");
                this.stopRetrying();
            }
        });
        // New windows
        this.webContents.setWindowOpenHandler(this.handleWindowOpen);
    }
    /**
     * Open the find in page UI
     */
    openFindInPage() {
        this.webContents.send("open-find-in-page");
    }
    /**
     * Open the replace in page UI
     */
    openReplaceInPage() {
        this.webContents.send("open-replace-in-page");
    }
    /**
     * Handle navigation event
     *
     * @param path The path to navigate to
     */
    redirect(path) {
        this.webContents.send("redirect", path);
    }
    /**
     * Go back in history, if possible
     */
    back() {
        if (this.webContents.navigationHistory.canGoBack()) {
            this.webContents.navigationHistory.goBack();
        }
    }
    /**
     * Go forward in history, if possible
     */
    forward() {
        if (this.webContents.navigationHistory.canGoForward()) {
            this.webContents.navigationHistory.goForward();
        }
    }
    /**
     * Show and immediately focus the window
     */
    showAndFocus() {
        this.show();
        this.focus();
    }
    /**
     * Handle double click on title bar
     */
    doubleClickTitlebar() {
        if (Platform_1.default.isMac()) {
            const action = electron_1.systemPreferences.getUserDefault("AppleActionOnDoubleClick", "string");
            // Settings -> Dock & Menu Bar -> Uncheck "double click a windows titlebar to…"
            if (action === "None") {
                return;
            }
            // Settings -> Dock & Menu Bar -> Double click a windows titlebar to minimize
            if (action === "Minimize") {
                return this.minimize();
            }
        }
        // Default behavior is to toggle maximized on non-macOS and other platforms
        if (this.isMaximized()) {
            return this.unmaximize();
        }
        return this.maximize();
    }
    /**
     * Send the current navigation state (canGoBack/canGoForward) to the renderer.
     */
    sendNavigationState() {
        this.webContents.send("navigation-state-changed", {
            canGoBack: this.webContents.navigationHistory.canGoBack(),
            canGoForward: this.webContents.navigationHistory.canGoForward(),
        });
    }
    /**
     * Schedule a connectivity retry after a delay.
     */
    scheduleRetry() {
        this.stopRetrying();
        this.retryTimer = setTimeout(() => {
            electron_log_1.default.info("Retry timer fired");
            this.retryConnection();
        }, 3000);
        electron_log_1.default.info(`Retry scheduled in 3s (timer: ${this.retryTimer})`);
    }
    /**
     * Cancel any pending retry timer.
     */
    stopRetrying() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }
    /**
     * Check if the target URL is reachable, and navigate to it if so.
     */
    retryConnection() {
        electron_log_1.default.info(`retryConnection called (destroyed: ${this.isDestroyed()})`);
        if (this.isDestroyed())
            return;
        electron_log_1.default.info(`Retry: checking connectivity to ${this.targetUrl}`);
        const request = electron_1.net.request({ method: "HEAD", url: this.targetUrl });
        request.on("response", (response) => {
            electron_log_1.default.info(`Retry: server responded with status ${response.statusCode}, loading target URL`);
            if (!this.isDestroyed()) {
                this.loadURL(this.targetUrl);
            }
        });
        request.on("error", (error) => {
            electron_log_1.default.info(`Retry: still offline (${error.message}), scheduling next retry`);
            if (!this.isDestroyed()) {
                this.scheduleRetry();
            }
        });
        request.end();
    }
}
exports.default = AppWindow;
