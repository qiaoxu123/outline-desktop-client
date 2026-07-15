import { create } from "zustand";

export interface UIState {
  activeProfileId: string | null;
  sidebarCollapsed: boolean;
  selectedCollectionId: string | null;
  selectedDocumentId: string | null;
  globalSearchOpen: boolean;
  /** Show the document table of contents panel (persisted). */
  showToc: boolean;
  /** Color theme (persisted). "system" follows OS preference. */
  theme: "light" | "dark" | "system";
  /** Reading column width level 1 (narrowest) → 5 (full width). Persisted. */
  contentWidth: 1 | 2 | 3 | 4 | 5;

  setActiveProfileId: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleToc: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setContentWidth: (level: 1 | 2 | 3 | 4 | 5) => void;
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
  showToc: localStorage.getItem("ui.showToc") !== "0",
  theme:
    (localStorage.getItem("ui.theme") as "light" | "dark" | "system" | null) ??
    "system",
  contentWidth: ((): 1 | 2 | 3 | 4 | 5 => {
    // Default is 适中 = level 3 (now ~1100px, a comfortable reading width).
    // The px scale was rebalanced narrower (760/920/1100/1320/full) so lower
    // levels actually take effect. One-time v2 migration resets everyone to
    // 适中 once, because the previous stored levels mapped to different widths.
    if (!localStorage.getItem("ui.contentWidth.scaleV2")) {
      localStorage.setItem("ui.contentWidth.scaleV2", "1");
      localStorage.setItem("ui.contentWidth", "3");
    }
    const v = Number(localStorage.getItem("ui.contentWidth"));
    return v >= 1 && v <= 5 ? (v as 1 | 2 | 3 | 4 | 5) : 3;
  })(),

  setActiveProfileId: (id) => set({ activeProfileId: id }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
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
  setContentWidth: (level) => {
    localStorage.setItem("ui.contentWidth", String(level));
    set({ contentWidth: level });
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
  /** Pinned tabs sort first, survive 关闭其他/全部关闭, and persist. */
  pinned?: boolean;
}

export interface TabsState {
  tabs: DocTab[];
  /** Open (or focus) a tab for a document. */
  openTab: (tab: DocTab) => void;
  /** Update a tab's title/emoji once the document loads. */
  updateTab: (documentId: string, patch: Partial<DocTab>) => void;
  /** Close a tab; returns the neighbour to navigate to (or null). */
  closeTab: (documentId: string) => string | null;
  togglePin: (documentId: string) => void;
  /** Drag-reorder: move the dragged tab to the dropped-on tab's slot. */
  moveTab: (fromId: string, toId: string) => void;
  /** Close every unpinned tab except the given one. */
  closeOthers: (documentId: string) => void;
  /** Close every unpinned tab. */
  closeAll: () => void;
}

/** Pinned tabs first, both groups keeping their relative order. */
function sortTabs(tabs: DocTab[]): DocTab[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

function loadTabs(): DocTab[] {
  try {
    const raw = localStorage.getItem("ui.tabs");
    return raw ? sortTabs(JSON.parse(raw) as DocTab[]) : [];
  } catch {
    return [];
  }
}

function persistTabs(tabs: DocTab[]): DocTab[] {
  localStorage.setItem("ui.tabs", JSON.stringify(tabs));
  return tabs;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: loadTabs(),
  openTab: (tab) =>
    set((s) =>
      s.tabs.some((t) => t.documentId === tab.documentId)
        ? s
        : { tabs: persistTabs([...s.tabs, tab]) },
    ),
  updateTab: (documentId, patch) =>
    set((s) => ({
      tabs: persistTabs(
        s.tabs.map((t) =>
          t.documentId === documentId ? { ...t, ...patch } : t,
        ),
      ),
    })),
  closeTab: (documentId) => {
    const { tabs } = get();
    const idx = tabs.findIndex((t) => t.documentId === documentId);
    if (idx === -1) return null;
    const next = tabs.filter((t) => t.documentId !== documentId);
    set({ tabs: persistTabs(next) });
    if (next.length === 0) return null;
    const neighbour = next[Math.min(idx, next.length - 1)];
    return neighbour.documentId;
  },
  togglePin: (documentId) =>
    set((s) => ({
      tabs: persistTabs(
        sortTabs(
          s.tabs.map((t) =>
            t.documentId === documentId ? { ...t, pinned: !t.pinned } : t,
          ),
        ),
      ),
    })),
  moveTab: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s;
      const arr = [...s.tabs];
      const from = arr.findIndex((t) => t.documentId === fromId);
      const to = arr.findIndex((t) => t.documentId === toId);
      if (from === -1 || to === -1) return s;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      // Keep the pinned-first invariant; reordering is free within each group.
      return { tabs: persistTabs(sortTabs(arr)) };
    }),
  closeOthers: (documentId) =>
    set((s) => ({
      tabs: persistTabs(
        s.tabs.filter((t) => t.pinned || t.documentId === documentId),
      ),
    })),
  closeAll: () =>
    set((s) => ({ tabs: persistTabs(s.tabs.filter((t) => t.pinned)) })),
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
