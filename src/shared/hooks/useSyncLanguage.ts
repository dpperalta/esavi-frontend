import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

// Keeps i18next in sync with preferences.language (ARCHITECTURE.md §7.4) — the connection
// shared/config/i18n.ts's own comment defers to "once the store exists" (step 4). Without
// this, the interface stays in the chosen language but server messages default to Spanish
// (API-CONTRACT.md §6), since the axios interceptor reads this same store for `?lang=`.
export function useSyncLanguage() {
  const language = usePreferencesStore((state) => state.language);
  const { i18n } = useTranslation();

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language, i18n]);
}
