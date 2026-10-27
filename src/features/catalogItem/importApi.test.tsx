import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItemImportReport } from '@/contracts/catalogItem';
import { setAccessToken } from '@/shared/api/client';
import { EsaviApiError } from '@/shared/api/types';
import { tokenStore } from '@/shared/api/tokenStore';
import { useImportCatalogItems } from './importApi';

const server = setupServer();
const IMPORT_URL = 'http://localhost:4500/api/catalog-items/import';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

function buildReport(dryRun: boolean): CatalogItemImportReport {
  return {
    read: 1,
    inserted: 1,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    catalogTypesCreated: 0,
    sortOrderCoerced: 0,
    dryRun,
    sheet: 'Items',
    missingOptionalHeaders: [],
    unknownHeaders: [],
    errors: [],
  };
}

const xlsxFile = new File(['PK'], 'catalog-items.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

describe('useImportCatalogItems — ESAVI-CATITEM-006', () => {
  it('con dryRun: true envía dryRun=true y no invalida ninguna clave', async () => {
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        // The raw body, not `request.formData()`, as in vaccineWhodrug/importApi.test.tsx.
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportCatalogItems(), { wrapper: Wrapper });

    result.current.mutate({ file: xlsxFile, dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toContain('name="file"');
    expect(body).toContain('name="dryRun"\r\n\r\ntrue');
    expect(body).not.toContain('name="dictionaryVersion"');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('con dryRun: false envía dryRun=false e invalida catalogItem y catalogType', async () => {
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(false) });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportCatalogItems(), { wrapper: Wrapper });

    result.current.mutate({ file: xlsxFile, dryRun: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['catalogItem'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['catalogType'] });
  });

  it('un 400 CATITEM_006_FILE_INVALID llega como EsaviApiError con su code', async () => {
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Archivo inválido',
            code: 'CATITEM_006_FILE_INVALID',
            errors: ['debug'],
          },
          { status: 400 },
        ),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useImportCatalogItems(), { wrapper: Wrapper });

    result.current.mutate({ file: xlsxFile, dryRun: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).code).toBe('CATITEM_006_FILE_INVALID');
    expect((result.current.error as EsaviApiError).status).toBe(400);
  });
});
