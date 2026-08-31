import { DEFAULT_PREFERENCES, type Preferences, type PreferencesStore } from './preferences.types';

// STORAGE_KEY es la misma clave que preferencesStore.ts persiste con zustand/persist — este
// módulo lee esa clave, nunca escribe: zustand/persist es el único escritor de
// 'esavi-preferences' (evita el conflicto de dos capas escribiendo el mismo dato, CONVENTIONS
// §7). `write()` existe porque §7.3 lo declara como el enganche para cuando exista la
// implementación remota; nada de esta rama lo llama todavía — es la misma situación que
// TokenStore antes de que exista la cookie httpOnly de la fase 2.
const STORAGE_KEY = 'esavi-preferences';

function readStoredPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      state?: Partial<Preferences>;
    };
    return { ...DEFAULT_PREFERENCES, ...stored.state };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export const localPreferencesStore: PreferencesStore = {
  async read() {
    return readStoredPreferences();
  },
  async write(patch) {
    const current = readStoredPreferences();
    const next = { ...current, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: next, version: 0 }));
  },
};
