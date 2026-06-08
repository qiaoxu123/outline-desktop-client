import { contextBridge, ipcRenderer } from "electron";

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
    loginWithBrowser: () => Promise<unknown>;
    requestEmailLogin: (email: string) => Promise<unknown>;
    completeEmailLogin: (input: string, email?: string) => Promise<unknown>;
  };
  /** Whitelisted pass-through to the Outline API (see main api.ts). */
  call: (
    profileId: string,
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
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
    update: (profileId, params) =>
      ipcRenderer.invoke("documents:update", { profileId, ...params }),
    search: (profileId, params) =>
      ipcRenderer.invoke("documents:search", { profileId, ...params }),
  },
  auth: {
    loginWithBrowser: () => ipcRenderer.invoke("auth:loginWithBrowser"),
    requestEmailLogin: (email) =>
      ipcRenderer.invoke("auth:requestEmailLogin", { email }),
    completeEmailLogin: (input, email) =>
      ipcRenderer.invoke("auth:completeEmailLogin", { input, email }),
  },
  call: (profileId, method, params) =>
    ipcRenderer.invoke("api:call", { profileId, method, params }),
  platform: process.platform,
};

contextBridge.exposeInMainWorld("electronAPI", api);
