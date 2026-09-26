import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { diagnosticTermResource } from './api';

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

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const emptyList = { ok: true, message: 'ok', data: { count: 0, rows: [] } };

describe('diagnosticTermResource — ESAVI-DIAGTERM-002A/002B', () => {
  it('sin includeInactive pega al 002A con name y code, nunca search', async () => {
    mockCurrentUser('USER', 25);
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/diagnostic-terms', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json(emptyList);
      }),
    );

    renderHook(
      () =>
        diagnosticTermResource.useList({
          page: 1,
          pageSize: 10,
          filters: { name: 'fiebre', code: 'fiebre', source: 'MEDDRA' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('name')).toBe('fiebre');
    expect(receivedUrl!.searchParams.get('code')).toBe('fiebre');
    expect(receivedUrl!.searchParams.get('source')).toBe('MEDDRA');
    expect(receivedUrl!.searchParams.has('search')).toBe(false);
  });

  it('con ADMIN e includeInactive pega al 002B con reviewStatus', async () => {
    mockCurrentUser('ADMIN', 50);
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/diagnostic-terms/admin', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json(emptyList);
      }),
    );

    renderHook(
      () =>
        diagnosticTermResource.useList({
          page: 1,
          pageSize: 10,
          includeInactive: true,
          filters: { reviewStatus: 'PENDING' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('reviewStatus')).toBe('PENDING');
  });
});
