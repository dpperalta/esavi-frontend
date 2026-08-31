// Compara las claves de src/locales/{es,en,nl}.json. CONVENTIONS.md §9 exige paridad exacta:
// una clave que falta en un idioma se muestra en crudo en la interfaz de ese idioma.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const LANGUAGES = ['es', 'en', 'nl'];

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value, fullKey);
    }
    return [fullKey];
  });
}

function loadKeys(lang) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  return new Set(flattenKeys(JSON.parse(raw)));
}

const keysByLang = Object.fromEntries(LANGUAGES.map((lang) => [lang, loadKeys(lang)]));
const allKeys = new Set(LANGUAGES.flatMap((lang) => [...keysByLang[lang]]));

let hasMismatch = false;

for (const key of allKeys) {
  const missingIn = LANGUAGES.filter((lang) => !keysByLang[lang].has(key));
  if (missingIn.length > 0) {
    hasMismatch = true;
    console.error(`✖ "${key}" falta en: ${missingIn.join(', ')}`);
  }
}

if (hasMismatch) {
  console.error('\ni18n:check — las claves de es/en/nl no tienen paridad exacta.');
  process.exit(1);
}

console.log(`i18n:check — ${allKeys.size} claves, paridad exacta en es/en/nl.`);
process.exit(0);
