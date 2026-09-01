import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { createResource } from './createResource';

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

interface Widget {
  widgetId: string;
  name: string;
}

describe('createResource — inactiveMode adminPath', () => {
  const resource = createResource<Widget>({
    key: 'widget',
    path: '/widgets',
    adminPath: '/widgets/admin',
    idField: 'widgetId',
    inactiveMode: 'adminPath',
  });

  it('con nivel ADMIN e includeInactive:true, pega a /widgets/admin', async () => {
    signIn();
    mockCurrentUser('ADMIN', 50);
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/widgets/admin', () => {
        hitAdmin = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(() => resource.useList({ pageSize: 10, includeInactive: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hitAdmin).toBe(true));
  });

  it('con nivel USER e includeInactive:true, pega a /widgets (no al admin)', async () => {
    signIn();
    mockCurrentUser('USER', 25);
    let hitPlain = false;
    server.use(
      http.get('http://localhost:4500/api/widgets', () => {
        hitPlain = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/widgets/admin', () =>
        HttpResponse.json({ ok: false, message: 'forbidden', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );

    renderHook(() => resource.useList({ pageSize: 10, includeInactive: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hitPlain).toBe(true));
  });
});

describe('createResource — inactiveMode serverDecides', () => {
  const resource = createResource<Widget>({
    key: 'widget',
    path: '/widgets',
    idField: 'widgetId',
    inactiveMode: 'serverDecides',
  });

  it('includeInactive no cambia la URL, siempre pega a /widgets', async () => {
    signIn();
    mockCurrentUser('SUPERADMIN', 100);
    let hitCount = 0;
    server.use(
      http.get('http://localhost:4500/api/widgets', () => {
        hitCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(() => resource.useList({ pageSize: 10, includeInactive: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hitCount).toBe(1));
  });
});

describe('createResource — paginación', () => {
  const resource = createResource<Widget>({
    key: 'widget',
    path: '/widgets',
    idField: 'widgetId',
    inactiveMode: 'serverDecides',
  });

  it('page: 3 con pageSize: 25 produce ?limit=25&offset=50', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/widgets', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(() => resource.useList({ page: 3, pageSize: 25 }), { wrapper: createWrapper() });

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('limit')).toBe('25');
    expect(receivedUrl!.searchParams.get('offset')).toBe('50');
  });
});

describe('createResource — invalidación tras mutar', () => {
  const resource = createResource<Widget>({
    key: 'widget',
    path: '/widgets',
    idField: 'widgetId',
    inactiveMode: 'serverDecides',
  });

  it('crear invalida el listado y el detalle a la vez', async () => {
    let listCallCount = 0;
    server.use(
      http.get('http://localhost:4500/api/widgets', () => {
        listCallCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/widgets/w1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { widgetId: 'w1', name: 'Widget 1' } }),
      ),
      http.post('http://localhost:4500/api/widgets', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { widgetId: 'w2', name: 'Widget 2' } }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result: listResult } = renderHook(() => resource.useList({ pageSize: 10 }), {
      wrapper: Wrapper,
    });
    const { result: detailResult } = renderHook(() => resource.useOne('w1'), { wrapper: Wrapper });
    const { result: createResult } = renderHook(() => resource.useCreate(), { wrapper: Wrapper });

    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailResult.current.isSuccess).toBe(true));
    expect(listCallCount).toBe(1);

    createResult.current.mutate({ name: 'Widget 2' });

    await waitFor(() => expect(createResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(listCallCount).toBe(2));
    await waitFor(() => expect(detailResult.current.isFetching).toBe(false));
  });
});

interface CatalogItem {
  catalogItemId: string;
  catalogTypeId: string;
}

describe('createResource — listado con padre (hallazgo D)', () => {
  const resource = createResource<CatalogItem>({
    key: 'catalogItem',
    path: '/catalog-items',
    adminPath: '/catalog-items/admin',
    idField: 'catalogItemId',
    inactiveMode: 'adminPath',
    parent: { operation: 'byType', segment: 'type/:parentId', adminSegment: 'admin/type/:parentId' },
  });

  it('pega a la ruta con el FK en el path, nunca en un query param', async () => {
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(() => resource.useListByParent?.('ct-1', { pageSize: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('parentId')).toBeNull();
  });
});
