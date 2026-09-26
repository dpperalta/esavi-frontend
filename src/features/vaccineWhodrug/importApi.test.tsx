import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaccineWhodrugImportReport } from '@/contracts/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useImportVaccineWhodrugs } from './importApi';

const server = setupServer();
const IMPORT_URL = 'http://localhost:4500/api/whodrug-vaccines/import';

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

function buildReport(dryRun: boolean): VaccineWhodrugImportReport {
  return {
    read: 1,
    inserted: 1,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    dryRun,
    sheet: 'WHODrug',
    missingOptionalHeaders: [],
    unknownHeaders: [],
    errors: [],
  };
}

const xlsxFile = new File(['PK'], 'whodrug.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

describe('useImportVaccineWhodrugs — ESAVI-WHODRUG-007', () => {
  it('con dryRun: true no invalida ninguna clave', async () => {
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportVaccineWhodrugs(), { wrapper: Wrapper });

    result.current.mutate({ file: xlsxFile, dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('con dryRun: false envía el fichero y la versión, e invalida whodrugVaccine', async () => {
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        // The raw body, not `request.formData()`, as in diagnosticTerm/importApi.test.tsx.
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(false) });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const levelKey = ['whodrugVaccine', 'level', 'abbreviation', {}, '', 'es'];
    queryClient.setQueryData(levelKey, { matchCount: 1, options: [] });
    const { result } = renderHook(() => useImportVaccineWhodrugs(), { wrapper: Wrapper });

    result.current.mutate({
      file: xlsxFile,
      dryRun: false,
      dictionaryVersion: 'WHODrug Global 2025 Sep 1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toContain('name="file"');
    expect(body).toContain('name="dictionaryVersion"\r\n\r\nWHODrug Global 2025 Sep 1');
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
    expect(queryClient.getQueryState(levelKey)?.isInvalidated).toBe(true);
  });

  it('sin dictionaryVersion no envía el campo', async () => {
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) });
      }),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useImportVaccineWhodrugs(), { wrapper: Wrapper });
    result.current.mutate({ file: xlsxFile, dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).not.toContain('name="dictionaryVersion"');
  });
});
