import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { healthFacilityResource, useHealthFacilitySearch } from './api';

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

describe('healthFacilityResource — useListByParent (dual listing, hallazgo B)', () => {
  it('con rol ADMIN e includeInactive:true pega a /health-facilities/admin/location/:id', async () => {
    signIn();
    mockCurrentUser('ADMIN', 50);
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/admin/location/loc-1', () => {
        hitAdmin = true;
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(
      () =>
        healthFacilityResource.useListByParent?.('loc-1', { pageSize: 10, includeInactive: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(hitAdmin).toBe(true));
  });

  it('con rol USER pega a /health-facilities/location/:id, sin importar includeInactive', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let hitPublic = false;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/location/loc-1', () => {
        hitPublic = true;
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(
      () =>
        healthFacilityResource.useListByParent?.('loc-1', { pageSize: 10, includeInactive: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(hitPublic).toBe(true));
  });
});

describe('useHealthFacilitySearch (ESAVI-HFAC-006)', () => {
  it('con un carácter no dispara ninguna petición', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let requested = false;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/search', () => {
        requested = true;
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(() => useHealthFacilitySearch({ q: 'a', pageSize: 25 }), {
      wrapper: createWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requested).toBe(false);
  });

  it('con dos caracteres pega a /health-facilities/search con name y code iguales al término', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/search', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(() => useHealthFacilitySearch({ q: 'ho', pageSize: 25 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('name')).toBe('ho');
    expect(requestedUrl!.searchParams.get('code')).toBe('ho');
    expect(requestedUrl!.searchParams.has('geoLocationId')).toBe(false);
  });

  it('con una ubicación elegida manda geoLocationId como filtro exacto', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/search', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json(emptyPage);
      }),
    );

    renderHook(() => useHealthFacilitySearch({ q: 'ho', geoLocationId: 'loc-1', pageSize: 25 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('geoLocationId')).toBe('loc-1');
  });
});
