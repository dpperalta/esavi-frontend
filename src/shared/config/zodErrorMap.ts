import i18next from 'i18next';
import { z } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';

// Zod's built-in messages ("Invalid UUID", "Too small: expected string to have >=1
// characters") are always English and never pass through react-i18next — CLAUDE.md requires
// every visible string, including form validation, to go through i18n. This is a single global
// map (CONVENTIONS.md §4: primitives written once) instead of a custom `message` on every
// `z.string()...` call in every features/<entity>/schemas.ts.
function zodI18nErrorMap(issue: $ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return i18next.t('errors.validation.required');
    case 'too_small':
      if (issue.origin === 'string' && issue.minimum === 1) {
        return i18next.t('errors.validation.required');
      }
      if (issue.origin === 'string') {
        return i18next.t('errors.validation.tooShort', { count: Number(issue.minimum) });
      }
      return i18next.t('errors.validation.numberTooSmall', { count: Number(issue.minimum) });
    case 'too_big':
      if (issue.origin === 'string') {
        return i18next.t('errors.validation.tooLong', { count: Number(issue.maximum) });
      }
      return i18next.t('errors.validation.numberTooBig', { count: Number(issue.maximum) });
    case 'invalid_format':
      if (issue.format === 'uuid') return i18next.t('errors.validation.invalidUuid');
      if (issue.format === 'email') return i18next.t('errors.validation.invalidEmail');
      return i18next.t('errors.validation.invalid');
    default:
      return i18next.t('errors.validation.invalid');
  }
}

export function registerZodI18nErrorMap(): void {
  z.config({ customError: zodI18nErrorMap });
}
