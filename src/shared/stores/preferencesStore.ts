import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_PREFERENCES,
  type Density,
  type Language,
  type Preferences,
  type Theme,
} from './preferences.types';

interface PreferencesState extends Preferences {
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDensity: (density: Density) => void;
  setPageSize: (pageSize: number) => void;
  setTableColumns: (entity: string, columns: string[]) => void;
}

// Persisted with zustand/persist under 'esavi-preferences' (ARCHITECTURE.md §7.2). The
// anti-flicker script in index.html reads this same key with this same shape —{state,
// version}— before React mounts; changing the storage engine here means revisiting that script.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setDensity: (density) => set({ density }),
      setPageSize: (pageSize) => set({ pageSize }),
      setTableColumns: (entity, columns) =>
        set((state) => ({
          tableColumns: { ...state.tableColumns, [entity]: columns },
        })),
    }),
    { name: 'esavi-preferences' },
  ),
);
