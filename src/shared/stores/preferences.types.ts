export type Theme = 'light' | 'dark' | 'system';
export type Language = 'es' | 'en' | 'nl';
export type Density = 'comfortable' | 'compact';

// The exact shape the appUserPreference JSONB column would have (ARCHITECTURE.md §7.2), so
// migrating to the server table is swapping the implementation, not the consumers.
export interface Preferences {
  theme: Theme;
  language: Language;
  sidebarCollapsed: boolean;
  density: Density;
  pageSize: number;
  tableColumns: Record<string, string[]>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  language: 'es',
  sidebarCollapsed: false,
  density: 'comfortable',
  // DEFAULT_LIMIT de esavi-backend/src/constants/pagination.constants.ts (SPEC FE02 §3.1).
  pageSize: 10,
  tableColumns: {},
};

// ARCHITECTURE.md §7.3: the interface persistence hides behind, same as TokenStore (§11.1).
// Implemented with localStorage today (localPreferencesStore.ts); the day
// `GET/PATCH /api/users/me/preferences` exists, the remote implementation gets added and
// preferencesStore.ts —which persists with zustand/persist today, see §7.2— doesn't change.
export interface PreferencesStore {
  read(): Promise<Preferences>;
  write(patch: Partial<Preferences>): Promise<void>;
}
