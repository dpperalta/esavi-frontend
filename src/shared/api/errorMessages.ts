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
  // SPEC FE03 §3.5 — the catalogItem codes that go to the toast: the type isn't a form field, so
  // `_CATTYPE_NOT_FOUND` has nowhere to mark; the other three are reachable only from a stale tab
  // (§3.6, §7), never from an action this screen offers.
  CATITEM_001_CATTYPE_NOT_FOUND: 'catalogItem.errors.CATITEM_001_CATTYPE_NOT_FOUND',
  CATITEM_004_CATTYPE_NOT_FOUND: 'catalogItem.errors.CATITEM_004_CATTYPE_NOT_FOUND',
  CATITEM_004_NOT_FOUND: 'catalogItem.errors.CATITEM_004_NOT_FOUND',
  CATITEM_005A_VALUE_LOCKED: 'catalogItem.errors.CATITEM_005A_VALUE_LOCKED',
  CATITEM_005A_ALREADY_INACTIVE: 'catalogItem.errors.CATITEM_005A_ALREADY_INACTIVE',
  CATITEM_005B_ALREADY_ACTIVE: 'catalogItem.errors.CATITEM_005B_ALREADY_ACTIVE',
  // SPEC FE04 §3.6, hallazgo C — errorFieldMap only maps the `GEOTYPE_*` CODE_EXISTS codes to
  // the `code` field; these three go to the toast instead.
  GEOTYPE_004_NOT_FOUND: 'geoLevelType.errors.GEOTYPE_004_NOT_FOUND',
  GEOTYPE_005A_ALREADY_INACTIVE: 'geoLevelType.errors.GEOTYPE_005A_ALREADY_INACTIVE',
  GEOTYPE_005B_ALREADY_ACTIVE: 'geoLevelType.errors.GEOTYPE_005B_ALREADY_ACTIVE',
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
