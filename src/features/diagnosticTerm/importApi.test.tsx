import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticTermImportReport } from '@/contracts/diagnosticTerm';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useImportDiagnosticTerms } from './importApi';

const server = setupServer();

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

function buildReport(dryRun: boolean): DiagnosticTermImportReport {
  return {
    read: 1,
    inserted: 1,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    dryRun,
    source: 'MEDDRA',
    termGroup: 'LLT',
    errors: [],
  };
}

const baseVariables = {
  file: new File(['10000001$Fiebre$$$$$$$Y$$'], 'llt.asc'),
  source: 'MEDDRA' as const,
  termGroup: 'LLT',
  dictionaryVersion: '27.1',
  encoding: 'utf8' as const,
};

describe('useImportDiagnosticTerms — ESAVI-DIAGTERM-007', () => {
  it('con dryRun: true no invalida ninguna clave', async () => {
    server.use(
      http.post('http://localhost:4500/api/diagnostic-terms/import', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportDiagnosticTerms(), { wrapper: Wrapper });

    result.current.mutate({ ...baseVariables, dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('con dryRun: false envía todos los campos e invalida diagnosticTerm', async () => {
    let body = '';
    server.use(
      http.post('http://localhost:4500/api/diagnostic-terms/import', async ({ request }) => {
        // The raw body, not `request.formData()`: undici's multipart parser throws on this body
        // under Node 24 (see geoLocation/importApi.test.tsx).
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(false) });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportDiagnosticTerms(), { wrapper: Wrapper });

    result.current.mutate({ ...baseVariables, dryRun: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Only the field name: a jsdom File loses its filename crossing into undici's FormData.
    expect(body).toContain('name="file"');
    expect(body).toContain('name="encoding"\r\n\r\nutf8');
    expect(body).toContain('name="source"\r\n\r\nMEDDRA');
    expect(body).toContain('name="termGroup"\r\n\r\nLLT');
    expect(body).toContain('name="dictionaryVersion"\r\n\r\n27.1');
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['diagnosticTerm'] });
  });
});
