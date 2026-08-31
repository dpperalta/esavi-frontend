import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import type { Theme } from '@/shared/stores/preferences.types';

function isDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Keeps document.documentElement[data-theme] in sync with preferences.theme. The anti-flicker
// script in index.html (ARCHITECTURE.md §6.4) already sets the right value before the first
// paint; this hook keeps it correct afterwards, including the live change of the operating
// system while theme === 'system'.
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

// Same resolution logic as useSyncTheme, exposed as a value for components that need the
// resolved light/dark theme directly — e.g. the toaster, which takes a 'light' | 'dark' prop
// instead of reading document.documentElement itself.
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = usePreferencesStore((state) => state.theme);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    isDark(theme) ? 'dark' : 'light',
  );

  useEffect(() => {
    setResolved(isDark(theme) ? 'dark' : 'light');

    if (theme !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setResolved(isDark(theme) ? 'dark' : 'light');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);

  return resolved;
}
