import { create } from 'zustand';

interface UIState {
  // Drawer del sidebar por debajo de md (ARCHITECTURE.md §5.3). Efímero: nunca persiste,
  // a diferencia de preferences.sidebarCollapsed, que es la variante de escritorio.
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
