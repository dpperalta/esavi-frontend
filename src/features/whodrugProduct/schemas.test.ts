import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { syncWhodrugProductsSchema, toSyncWhodrugProductsPayload } from './schemas';

describe('syncWhodrugProductsSchema (SPEC FE25d §3.5)', () => {
  it('acepta dictionaryVersion vacío: es opcional', () => {
    expect(syncWhodrugProductsSchema.safeParse({ dictionaryVersion: '' }).success).toBe(true);
  });

  it('rechaza 101 caracteres y acepta 100, como el validador del backend', () => {
    expect(
      syncWhodrugProductsSchema.safeParse({ dictionaryVersion: 'a'.repeat(101) }).success,
    ).toBe(false);
    expect(
      syncWhodrugProductsSchema.safeParse({ dictionaryVersion: 'a'.repeat(100) }).success,
    ).toBe(true);
  });
});

describe('toSyncWhodrugProductsPayload (SPEC FE25d §3.5)', () => {
  it('omite dictionaryVersion vacío o con solo espacios', () => {
    expect(toSyncWhodrugProductsPayload({ dictionaryVersion: '' }, true)).toEqual({ dryRun: true });
    expect(toSyncWhodrugProductsPayload({ dictionaryVersion: '   ' }, false)).toEqual({
      dryRun: false,
    });
  });

  it('envía dictionaryVersion recortado junto a dryRun', () => {
    expect(
      toSyncWhodrugProductsPayload({ dictionaryVersion: ' WHODrug Global 2025 Sep 1 ' }, true),
    ).toEqual({ dictionaryVersion: 'WHODrug Global 2025 Sep 1', dryRun: true });
  });
});

describe('errorMessages — códigos de SPEC FE25d §3.5', () => {
  it.each([
    'WHODPROD_007_DISABLED',
    'WHODPROD_007_NOT_CONFIGURED',
    'WHODPROD_007_DOWNLOAD_FAILED',
    'WHODPROD_007_ALREADY_RUNNING',
    'WHODPROD_007_SYNC_FAILED',
    'WHODPROD_002B_FETCH_FAILED',
  ])('%s resuelve a una clave existente, no al message del servidor', (code) => {
    const key = `whodrugProduct.errors.${code}`;
    expect(i18next.exists(key)).toBe(true);
    const error = new EsaviApiError('server message', 503, code);
    expect(getErrorMessage(error)).toBe(i18next.t(key));
  });
});
