import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { catalogItemResource } from './api';

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

function signIn() {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const emptyPage = { ok: true, message: 'ok', data: { count: 0, rows: [] } };

describe('catalogItemResource — useListByParent', () => {
  it('page: 2, pageSize: 25, includeInactive: false pega a /catalog-items/type/:id?limit=25&offset=25', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(
      () =>
        catalogItemResource.useListByParent?.('ct-1', {
          page: 2,
          pageSize: 25,
          includeInactive: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('limit')).toBe('25');
    expect(requestedUrl!.searchParams.get('offset')).toBe('25');
  });

  it('includeInactive: true con nivel ADMIN pega a /catalog-items/admin/type/:id', async () => {
    signIn();
    mockCurrentUser('ADMIN', 50);
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/admin/type/ct-1', () => {
        hitAdmin = true;
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(
      () => catalogItemResource.useListByParent?.('ct-1', { pageSize: 10, includeInactive: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(hitAdmin).toBe(true));
  });

  it('includeInactive: true con nivel USER vuelve a la ruta pública, no a /admin', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let hitPublic = false;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', () => {
        hitPublic = true;
        return HttpResponse.json(emptyPage);
      }),
      http.get('http://localhost:4500/api/catalog-items/admin/type/ct-1', () =>
        HttpResponse.json({ ok: false, message: 'forbidden', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );

    renderHook(
      () => catalogItemResource.useListByParent?.('ct-1', { pageSize: 10, includeInactive: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(hitPublic).toBe(true));
  });
});
