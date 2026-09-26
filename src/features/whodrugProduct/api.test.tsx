import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhodrugProductSyncReport } from '@/contracts/whodrugProduct';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useSyncWhodrugProducts, useWhodrugProductList } from './api';

const server = setupServer();
const LIST_URL = 'http://localhost:4500/api/whodrug-products/admin';
const SYNC_URL = 'http://localhost:4500/api/whodrug-products/sync';

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

function buildReport(dryRun: boolean): WhodrugProductSyncReport {
  return {
    downloaded: 10,
    flattened: 40,
    inserted: 40,
    updated: 0,
    unchanged: 0,
    deactivated: 0,
    invalid: 0,
    duplicated: 0,
    dryRun,
    errors: [],
  };
}

function captureListQuery(): { current: URLSearchParams | null } {
  const captured: { current: URLSearchParams | null } = { current: null };
  server.use(
    http.get(LIST_URL, ({ request }) => {
      captured.current = new URL(request.url).searchParams;
      return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
    }),
  );
  return captured;
}

describe('useWhodrugProductList — ESAVI-WHODPROD-002B', () => {
  it('con name: "pa" no envía name', async () => {
    const query = captureListQuery();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useWhodrugProductList({ pageSize: 20, name: 'pa' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(query.current?.has('name')).toBe(false);
  });

  it('con name: "par" e ingredient: "ibu" envía los dos y traduce página a offset', async () => {
    const query = captureListQuery();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useWhodrugProductList({ page: 3, pageSize: 20, name: 'par', ingredient: 'ibu' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(query.current?.get('name')).toBe('par');
    expect(query.current?.get('ingredient')).toBe('ibu');
    expect(query.current?.get('limit')).toBe('20');
    expect(query.current?.get('offset')).toBe('40');
  });

  it('sin filtros comparte la entrada de caché de la comprobación de espejo vacío', async () => {
    captureListQuery();
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useWhodrugProductList({ page: 1, pageSize: 1 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['whodrugProduct', 'list', { limit: 1, offset: 0 }])).toEqual({
      count: 0,
      rows: [],
    });
  });
});

describe('useSyncWhodrugProducts — ESAVI-WHODPROD-007', () => {
  it('con dryRun: true envía JSON con el booleano y no invalida nada', async () => {
    let contentType: string | null = null;
    let body: unknown = null;
    server.use(
      http.post(SYNC_URL, async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSyncWhodrugProducts(), { wrapper: Wrapper });

    result.current.mutate({ dictionaryVersion: 'WHODrug Global 2025 Sep 1', dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(contentType).toContain('application/json');
    expect(body).toEqual({ dictionaryVersion: 'WHODrug Global 2025 Sep 1', dryRun: true });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('con dryRun: false invalida también la búsqueda de la notificación', async () => {
    server.use(
      http.post(SYNC_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport(false) }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    const searchKey = ['whodrugProduct', 'search', 'ibu'];
    const listKey = ['whodrugProduct', 'list', { limit: 1, offset: 0 }];
    queryClient.setQueryData(searchKey, { term: 'ibu', count: 0, rows: [] });
    queryClient.setQueryData(listKey, { count: 0, rows: [] });
    const { result } = renderHook(() => useSyncWhodrugProducts(), { wrapper: Wrapper });

    result.current.mutate({ dryRun: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(searchKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
