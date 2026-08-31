import { create } from 'zustand';

interface UIState {
  // Sidebar drawer below md (ARCHITECTURE.md §5.3). Ephemeral: never persisted, unlike
  // preferences.sidebarCollapsed, which is the desktop variant.
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
