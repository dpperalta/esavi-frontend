import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import nl from '@/locales/nl.json';
import { registerZodI18nErrorMap } from './zodErrorMap';

// The active language is set by preferencesStore (ARCHITECTURE.md §7.4), not browser
// detection — wired up once the store exists (step 4). 'es' is the backend's DEFAULT_LANGUAGE.
void i18next.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    nl: { translation: nl },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
});

// Reads the active language at validation time (not at registration time), so it stays in
// sync with preferencesStore without re-registering on language change.
registerZodI18nErrorMap();

export { i18next };
