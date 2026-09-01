import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { geoLocationResource } from './api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('geoLocationResource — useList con filtros (SPEC FE04 §3.3)', () => {
  it('con filters: { geoLevelId, parentId } pega a la URL correcta', async () => {
    setAccessToken('a-token');
    tokenStore.setRefreshToken('a-refresh-token');

    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(
      () =>
        geoLocationResource.useList({
          page: 1,
          pageSize: 10,
          filters: { geoLevelId: 'glt-1', parentId: 'gl-1' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('geoLevelId')).toBe('glt-1');
    expect(receivedUrl!.searchParams.get('parentId')).toBe('gl-1');
  });

  it('con q traducido a filters: { name, code }, manda ambos con el mismo término (hallazgo F)', async () => {
    setAccessToken('a-token');
    tokenStore.setRefreshToken('a-refresh-token');

    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(
      () =>
        geoLocationResource.useList({
          page: 1,
          pageSize: 10,
          filters: { name: 'quito', code: 'quito' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('name')).toBe('quito');
    expect(receivedUrl!.searchParams.get('code')).toBe('quito');
  });
});
