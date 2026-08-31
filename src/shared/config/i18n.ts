import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import nl from '@/locales/nl.json';

// El idioma activo lo fija preferencesStore (ARCHITECTURE.md §7.4), no la detección del
// navegador — se conecta cuando el store existe (paso 4). 'es' es DEFAULT_LANGUAGE del backend.
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

export { i18next };
