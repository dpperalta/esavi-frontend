export type Theme = 'light' | 'dark' | 'system';
export type Language = 'es' | 'en' | 'nl';
export type Density = 'comfortable' | 'compact';

// La forma exacta que tendría la columna JSONB de appUserPreference (ARCHITECTURE.md §7.2),
// para que migrar a la tabla del servidor sea sustituir la implementación, no los consumidores.
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
  pageSize: 25,
  tableColumns: {},
};

// ARCHITECTURE.md §7.3: la interfaz tras la que se esconde la persistencia, igual que
// TokenStore (§11.1). Hoy la implementa localStorage (localPreferencesStore.ts); el día que
// exista `GET/PATCH /api/users/me/preferences` se añade la implementación remota y
// preferencesStore.ts —que hoy persiste con zustand/persist, ver §7.2— no cambia.
export interface PreferencesStore {
  read(): Promise<Preferences>;
  write(patch: Partial<Preferences>): Promise<void>;
}
