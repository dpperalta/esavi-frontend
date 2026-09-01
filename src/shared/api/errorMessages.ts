// Resolves the toast text for an EsaviApiError. The `code` decides, never a parse of `message`
// (CONVENTIONS.md §6.2). `errors` is debugging material and never reaches this module.
import { i18next } from '@/shared/config/i18n';
import type { EsaviApiError } from '@/shared/api/types';

// Grows as each entity declares its own codes (CONVENTIONS.md §6.4). A code routed to a form
// field via `errorFieldMap` (SPEC FE02 §3.6) doesn't need an entry here — it never reaches a
// toast, and the field shows the backend's own translated `message` instead (CONVENTIONS.md
// §6.2). Entries here are for codes that *do* reach the toast — a stable, client-owned text for
// a stable code, the same pattern SPEC FE01's ChangePasswordForm already uses.
const ERROR_CODE_KEYS: Record<string, string> = {
  // SPEC FE02 §3.6 — the three catalogType codes that go to the toast, not to a field.
  CATTYPE_001_CREATION_FAILED: 'catalogType.errors.CATTYPE_001_CREATION_FAILED',
  CATTYPE_004_UPDATE_FAILED: 'catalogType.errors.CATTYPE_004_UPDATE_FAILED',
  CATTYPE_004_NOT_FOUND: 'catalogType.errors.CATTYPE_004_NOT_FOUND',
};

export function getErrorMessage(error: EsaviApiError): string {
  const key = ERROR_CODE_KEYS[error.code];
  if (key) {
    return i18next.t(key);
  }
  if (error.message) {
    return error.message;
  }
  return i18next.t('common.errors.unexpected');
}
