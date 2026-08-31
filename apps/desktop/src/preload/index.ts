import { contextBridge, ipcRenderer } from "electron";

type DesktopCallback = (...args: any[]) => void;

export interface ElectronAPI {
  profiles: {
    list: () => Promise<unknown>;
    create: (payload: unknown) => Promise<unknown>;
    update: (payload: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<unknown>;
    verify: (id: string) => Promise<unknown>;
    userInfo: (id: string) => Promise<unknown>;
    testConnection: (payload: unknown) => Promise<unknown>;
  };
  collections: {
    list: (profileId: string) => Promise<unknown>;
    documents: (profileId: string, collectionId: string) => Promise<unknown>;
  };
  documents: {
    info: (profileId: string, documentId: string) => Promise<unknown>;
    create: (payload: unknown) => Promise<unknown>;
    update: (
      profileId: string,
      params: { id: string; title?: string; text?: string },
    ) => Promise<unknown>;
    search: (
      profileId: string,
      params: { query: string; collectionId?: string },
    ) => Promise<unknown>;
  };
  auth: {
    loginWithBrowser: (serverUrl: string) => Promise<unknown>;
    requestEmailLogin: (serverUrl: string, email: string) => Promise<unknown>;
    completeEmailLogin: (
      serverUrl: string,
      input: string,
      email?: string,
    ) => Promise<unknown>;
  };
  /** WebDAV storage for the self-test quiz (paths under the shared quiz dir). */
  webdav: {
    get: (path: string) => Promise<unknown>;
    put: (path: string, content: string) => Promise<unknown>;
  };
  /** Upload a file to Outline (drag/paste into the editor). Bytes are base64. */
  attachments: {
    upload: (
      profileId: string,
      payload: {
        documentId?: string;
        name: string;
        contentType: string;
        dataBase64: string;
      },
    ) => Promise<unknown>;
  };
  /** Whitelisted pass-through to the Outline API (see main api.ts). */
  call: (
    profileId: string,
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  /** Download a server attachment via Chromium (auth header injected in main). */
  downloadUrl: (url: string) => Promise<unknown>;
  /** Windows only: recolor the native window-controls overlay for the theme. */
  setTitleBarOverlay: (color: string, symbolColor: string) => void;
  /** Pointer to the user's personal-notes folder on the server. */
  personalNotes: {
    getRoot: (profileId: string) => Promise<unknown>;
    setRoot: (
      profileId: string,
      root: { docId: string; collectionId: string },
    ) => Promise<unknown>;
    clearRoot: (profileId: string) => Promise<unknown>;
  };
  ai: {
    getConfig: () => Promise<unknown>;
    setConfig: (payload: unknown) => Promise<unknown>;
    chat: (payload: unknown) => Promise<unknown>;
  };
  platform: string;
}

const api: ElectronAPI = {
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (payload) => ipcRenderer.invoke("profiles:create", payload),
    update: (payload) => ipcRenderer.invoke("profiles:update", payload),
    delete: (id) => ipcRenderer.invoke("profiles:delete", id),
    verify: (id) => ipcRenderer.invoke("profiles:verify", id),
    userInfo: (id) => ipcRenderer.invoke("profiles:userInfo", id),
    testConnection: (payload) =>
      ipcRenderer.invoke("profiles:testConnection", payload),
  },
  collections: {
    list: (profileId) =>
      ipcRenderer.invoke("collections:list", { profileId }),
    documents: (profileId, collectionId) =>
      ipcRenderer.invoke("collections:documents", { profileId, collectionId }),
  },
  documents: {
    info: (profileId, documentId) =>
      ipcRenderer.invoke("documents:info", { profileId, documentId }),
    create: (payload) => ipcRenderer.invoke("documents:create", payload),
    update: (profileId, params) =>
      ipcRenderer.invoke("documents:update", { profileId, ...params }),
    search: (profileId, params) =>
      ipcRenderer.invoke("documents:search", { profileId, ...params }),
  },
  auth: {
    loginWithBrowser: (serverUrl) =>
      ipcRenderer.invoke("auth:loginWithBrowser", { serverUrl }),
    requestEmailLogin: (serverUrl, email) =>
      ipcRenderer.invoke("auth:requestEmailLogin", { serverUrl, email }),
    completeEmailLogin: (serverUrl, input, email) =>
      ipcRenderer.invoke("auth:completeEmailLogin", { serverUrl, input, email }),
  },
  webdav: {
    get: (path) => ipcRenderer.invoke("webdav:get", { path }),
    put: (path, content) => ipcRenderer.invoke("webdav:put", { path, content }),
  },
  attachments: {
    upload: (profileId, payload) =>
      ipcRenderer.invoke("attachments:upload", { profileId, ...payload }),
  },
  call: (profileId, method, params) =>
    ipcRenderer.invoke("api:call", { profileId, method, params }),
  downloadUrl: (url) => ipcRenderer.invoke("attachments:download", { url }),
  setTitleBarOverlay: (color, symbolColor) =>
    ipcRenderer.send("win:setTitleBarOverlay", { color, symbolColor }),
  personalNotes: {
    getRoot: (profileId) =>
      ipcRenderer.invoke("personalNotes:getRoot", profileId),
    setRoot: (profileId, root) =>
      ipcRenderer.invoke("personalNotes:setRoot", { profileId, ...root }),
    clearRoot: (profileId) =>
      ipcRenderer.invoke("personalNotes:clearRoot", { profileId }),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke("ai:getConfig"),
    setConfig: (payload) => ipcRenderer.invoke("ai:setConfig", payload),
    chat: (payload) => ipcRenderer.invoke("ai:chat", payload),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld("electronAPI", api);

// Compatibility bridge consumed by the official Outline Web runtime. The
// bridge intentionally contains no credentials; sensitive work stays in IPC.
contextBridge.exposeInMainWorld("DesktopBridge", {
  platform: process.platform,
  version: () => "desktop",
  restart: async () => undefined,
  restartAndInstall: async () => undefined,
  checkForUpdates: async () => undefined,
  onTitlebarDoubleClick: async () => undefined,
  onLogout: async () => { await ipcRenderer.invoke("desktop:logout"); },
      addCustomHost: async (host: string) => {
    // Official Web uses this hook before navigating to a host. The desktop
    // profile remains the source of truth; select a matching configured host
    // when one exists and otherwise let the Web route handle the navigation.
    await ipcRenderer.invoke("desktop:setActiveProfileByHost", host);
      },
      webdavGet: (path: string) => ipcRenderer.invoke("webdav:get", { path }),
      webdavPut: (path: string, content: string) => ipcRenderer.invoke("webdav:put", { path, content }),
  loadAuthConfig: (host: string) => ipcRenderer.invoke("desktop:loadAuthConfig", host),
  clearConfig: async () => { await ipcRenderer.invoke("desktop:logout"); },
  setSpellCheckerLanguages: async (_languages: string[]) => undefined,
  setNotificationCount: async (_count: number | string) => undefined,
  focus: (callback: DesktopCallback) => ipcRenderer.on("desktop:focus", callback),
  blur: (callback: DesktopCallback) => ipcRenderer.on("desktop:blur", callback),
  redirect: (callback: DesktopCallback) => ipcRenderer.on("desktop:redirect", callback),
  updateDownloaded: (callback: DesktopCallback) => ipcRenderer.on("desktop:update-downloaded", callback),
  openKeyboardShortcuts: (callback: DesktopCallback) => ipcRenderer.on("desktop:keyboard-shortcuts", callback),
  goBack: () => ipcRenderer.send("desktop:history", "back"),
  goForward: () => ipcRenderer.send("desktop:history", "forward"),
});
