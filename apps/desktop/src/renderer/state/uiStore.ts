import { create } from "zustand";

export interface UIState {
  activeProfileId: string | null;
  sidebarCollapsed: boolean;
  selectedCollectionId: string | null;
  selectedDocumentId: string | null;
  globalSearchOpen: boolean;

  setActiveProfileId: (id: string | null) => void;
  toggleSidebar: () => void;
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

  setActiveProfileId: (id) => set({ activeProfileId: id }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
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
