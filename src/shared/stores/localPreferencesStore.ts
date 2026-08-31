import { DEFAULT_PREFERENCES, type Preferences, type PreferencesStore } from './preferences.types';

// STORAGE_KEY is the same key preferencesStore.ts persists with zustand/persist — this module
// reads that key, never writes: zustand/persist is the only writer of 'esavi-preferences'
// (avoids the two-layers-writing-the-same-data conflict, CONVENTIONS §7). `write()` exists
// because §7.3 declares it as the hook for when the remote implementation exists; nothing on
// this branch calls it yet — same situation as TokenStore before phase 2's httpOnly cookie.
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
