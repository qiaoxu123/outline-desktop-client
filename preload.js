"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
let version;
// Loaded upfront as it's awkward to have a promise interface for a static value.
electron_1.ipcRenderer.invoke("get-version").then((result) => {
    version = result;
});
electron_1.contextBridge.exposeInMainWorld("DesktopBridge", {
    /**
     * The name of the platform running on.
     */
    platform: process.platform,
    /**
     * The version of the loaded application.
     */
    version: () => version,
    /**
     * Restarts the application.
     */
    restart: () => electron_1.ipcRenderer.invoke("restart"),
    /**
     * Restarts the application and installs the update.
     */
    restartAndInstall: () => electron_1.ipcRenderer.invoke("restart-and-install"),
    /**
     * Tells the updater to check for updates now.
     */
    checkForUpdates: () => electron_1.ipcRenderer.invoke("check-for-updates"),
    /**
     * Passes double click events from titlebar area.
     */
    onTitlebarDoubleClick: () => electron_1.ipcRenderer.invoke("titlebar-double-click"),
    /**
     * Passes log out events from the app to main process.
     */
    onLogout: () => electron_1.ipcRenderer.invoke("logout-all-windows"),
    /**
     * Adds a custom host to config.
     */
    addCustomHost: (host) => electron_1.ipcRenderer.invoke("add-custom-host", host),
    /**
     * Loads the authentication configuration for the given host, bypassing
     * renderer CORS restrictions. Used to verify a host is a reachable Outline
     * installation before switching to it.
     */
    loadAuthConfig: (host) => electron_1.ipcRenderer.invoke("load-auth-config", host),
    /**
     * Clears the desktop configuration file, removing any custom hosts. Intended
     * for debugging use.
     */
    clearConfig: () => electron_1.ipcRenderer.invoke("clear-config"),
    /**
     * Set the language used by the spellchecker on Windows/Linux.
     */
    setSpellCheckerLanguages: (languages) => electron_1.ipcRenderer.invoke("set-spell-checker-languages", languages),
    /**
     * Set the badge on the app icon.
     */
    setNotificationCount: (count) => electron_1.ipcRenderer.invoke("set-notification-count", count),
    /**
     * Show a native OS notification. When the user clicks the notification the
     * window is focused and the `notification-clicked` event is fired on the
     * renderer with the original `deeplink` and `notificationId` payload, so
     * the web app can handle navigation via its router rather than a full page
     * load.
     */
    showNotification: (options) => electron_1.ipcRenderer.invoke("show-notification", options),
    /**
     * Registers a callback to be called when a native notification fired by
     * `showNotification` is clicked by the user. The callback receives the
     * `deeplink` and `notificationId` originally passed to `showNotification`,
     * if any.
     */
    onNotificationClicked: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("notification-clicked");
        electron_1.ipcRenderer.on("notification-clicked", (_, args) => {
            callback(args);
        });
    },
    /**
     * Get whether the app is configured to launch at login.
     */
    getAutoLaunch: () => electron_1.ipcRenderer.invoke("get-auto-launch"),
    /**
     * Enable or disable launching the app at login. Resolves with the
     * resulting state as reported by the OS.
     */
    setAutoLaunch: (enabled) => electron_1.ipcRenderer.invoke("set-auto-launch", enabled),
    /**
     * Registers a callback to be called when the window is focused.
     */
    focus: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("focus");
        electron_1.ipcRenderer.on("focus", () => {
            callback();
        });
    },
    /**
     * Registers a callback to be called when the window loses focus.
     */
    blur: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("blur");
        electron_1.ipcRenderer.on("blur", () => {
            callback();
        });
    },
    /**
     * Registers a callback to be called when a route change is requested from the main process.
     * This would usually be when it is responding to a deeplink.
     */
    redirect: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("redirect");
        electron_1.ipcRenderer.on("redirect", (_, path, replace = false) => {
            callback(path, replace);
        });
    },
    /**
     * Registers a callback to be called when a route change is requested from the main process.
     * This would usually be when it is responding to a deeplink.
     */
    onFindInPage: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("open-find-in-page");
        electron_1.ipcRenderer.on("open-find-in-page", callback);
    },
    /**
     * Registers a callback to be called when a route change is requested from the main process.
     * This would usually be when it is responding to a deeplink.
     */
    onReplaceInPage: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("open-replace-in-page");
        electron_1.ipcRenderer.on("open-replace-in-page", callback);
    },
    /**
     * Registers a callback to be called when the application is ready to update.
     */
    updateDownloaded: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("update-downloaded");
        electron_1.ipcRenderer.on("update-downloaded", () => {
            callback();
        });
    },
    /**
     * Registers a callback to be called when the application wants to open keyboard shortcuts.
     */
    openKeyboardShortcuts: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("open-keyboard-shortcuts");
        electron_1.ipcRenderer.on("open-keyboard-shortcuts", () => {
            callback();
        });
    },
    /**
     * Go back in history, if possible
     */
    goBack: () => {
        electron_1.ipcRenderer.invoke("history-back");
    },
    /**
     * Go forward in history, if possible
     */
    goForward: () => {
        electron_1.ipcRenderer.invoke("history-forward");
    },
    /**
     * Registers a callback to be called when navigation state changes.
     */
    onNavigationStateChanged: (callback) => {
        electron_1.ipcRenderer.removeAllListeners("navigation-state-changed");
        electron_1.ipcRenderer.on("navigation-state-changed", (_, state) => {
            callback(state);
        });
    },
});
