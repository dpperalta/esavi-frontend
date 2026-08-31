import { useEffect } from 'react';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import type { Theme } from '@/shared/stores/preferences.types';

function isDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Mantiene document.documentElement[data-theme] sincronizado con preferences.theme. El script
// anti-parpadeo de index.html (ARCHITECTURE.md §6.4) ya fija el valor correcto antes del primer
// paint; este hook lo mantiene correcto después, incluido el cambio en vivo del sistema
// operativo mientras theme === 'system'.
export function useSyncTheme() {
  const theme = usePreferencesStore((state) => state.theme);

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = isDark(theme) ? 'dark' : 'light';
    };
    applyTheme();

    if (theme !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);
}
