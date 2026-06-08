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

  setActiveProfileId: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleFullWidth: () => void;
  toggleToc: () => void;
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
  selectCollection: (id) => set({ selectedCollectionId: id }),
  selectDocument: (id) => set({ selectedDocumentId: id }),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
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
