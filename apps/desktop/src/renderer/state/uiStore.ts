import { create } from "zustand";

export interface UIState {
  activeProfileId: string | null;
  sidebarCollapsed: boolean;
  selectedCollectionId: string | null;
  selectedDocumentId: string | null;
  globalSearchOpen: boolean;
  /** One toggle widens every view (persisted). */
  fullWidth: boolean;
  /** Show the document table of contents panel (persisted). */
  showToc: boolean;
  /** Color theme (persisted). "system" follows OS preference. */
  theme: "light" | "dark" | "system";

  setActiveProfileId: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleFullWidth: () => void;
  toggleToc: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  selectCollection: (id: string | null) => void;
  selectDocument: (id: string | null) => void;
  setGlobalSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeProfileId: null,
  sidebarCollapsed: false,
  selectedCollectionId: null,
  selectedDocumentId: null,
  globalSearchOpen: false,
  fullWidth: localStorage.getItem("ui.fullWidth") === "1",
  showToc: localStorage.getItem("ui.showToc") !== "0",
  theme:
    (localStorage.getItem("ui.theme") as "light" | "dark" | "system" | null) ??
    "system",

  setActiveProfileId: (id) => set({ activeProfileId: id }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleFullWidth: () =>
    set((s) => {
      const fullWidth = !s.fullWidth;
      localStorage.setItem("ui.fullWidth", fullWidth ? "1" : "0");
      return { fullWidth };
    }),
  toggleToc: () =>
    set((s) => {
      const showToc = !s.showToc;
      localStorage.setItem("ui.showToc", showToc ? "1" : "0");
      return { showToc };
    }),
  setTheme: (theme) => {
    localStorage.setItem("ui.theme", theme);
    set({ theme });
  },
  selectCollection: (id) => set({ selectedCollectionId: id }),
  selectDocument: (id) => set({ selectedDocumentId: id }),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
}));

/* ---------- open document tabs ---------- */

export interface DocTab {
  documentId: string;
  title: string;
  emoji?: string | null;
}

export interface TabsState {
  tabs: DocTab[];
  /** Open (or focus) a tab for a document. */
  openTab: (tab: DocTab) => void;
  /** Update a tab's title/emoji once the document loads. */
  updateTab: (documentId: string, patch: Partial<DocTab>) => void;
  /** Close a tab; returns the neighbour to navigate to (or null). */
  closeTab: (documentId: string) => string | null;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  openTab: (tab) =>
    set((s) =>
      s.tabs.some((t) => t.documentId === tab.documentId)
        ? s
        : { tabs: [...s.tabs, tab] },
    ),
  updateTab: (documentId, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.documentId === documentId ? { ...t, ...patch } : t,
      ),
    })),
  closeTab: (documentId) => {
    const { tabs } = get();
    const idx = tabs.findIndex((t) => t.documentId === documentId);
    if (idx === -1) return null;
    const next = tabs.filter((t) => t.documentId !== documentId);
    set({ tabs: next });
    if (next.length === 0) return null;
    const neighbour = next[Math.min(idx, next.length - 1)];
    return neighbour.documentId;
  },
}));

export interface ProfileState {
  profiles: ProfileRecord[];
  setProfiles: (profiles: ProfileRecord[]) => void;
  addProfile: (profile: ProfileRecord) => void;
  removeProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<ProfileRecord>) => void;
}

export interface ProfileRecord {
  id: string;
  name: string;
  serverUrl: string;
  createdAt: string;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  setProfiles: (profiles) => set({ profiles }),
  addProfile: (profile) =>
    set((s) => ({ profiles: [...s.profiles, profile] })),
  removeProfile: (id) =>
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) })),
  updateProfile: (id, updates) =>
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
}));
