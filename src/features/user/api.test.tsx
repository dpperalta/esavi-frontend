import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  useAppRoles,
  useBulkAssignRoles,
  useRevokeUserRole,
  useUserRoleAssignments,
  useUserSearch,
  userResource,
} from './api';

const server = setupServer();

const USER_ID = 'user-1';
const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';

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

describe('useUserSearch — ESAVI-USER-008', () => {
  it('no dispara petición con un solo carácter', async () => {
    let calls = 0;
    server.use(
      http.get('http://localhost:4500/api/users/search', () => {
        calls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUserSearch('a', { pageSize: 10 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(calls).toBe(0);
    expect(result.current.data).toBeUndefined();
  });

  it('con dos caracteres pide una sola vez, con q, limit y offset', async () => {
    let calls = 0;
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/users/search', ({ request }) => {
        calls += 1;
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUserSearch('pe', { page: 2, pageSize: 10 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(1);
    expect(receivedUrl!.searchParams.get('q')).toBe('pe');
    expect(receivedUrl!.searchParams.get('limit')).toBe('10');
    expect(receivedUrl!.searchParams.get('offset')).toBe('10');
  });

  it('la clave de caché es ["user","search",{q,page,pageSize}] (SPEC FE20 §3.4)', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useUserSearch('pe', { pageSize: 25 }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['user', 'search', { q: 'pe', page: 1, pageSize: 25 }]),
    ).toEqual({ count: 0, rows: [] });
  });

  it('propaga el 400 USER_008_QUERY_REQUIRED con su code', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json(
          { ok: false, message: 'Search query is required', code: 'USER_008_QUERY_REQUIRED' },
          { status: 400 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUserSearch('..', { pageSize: 10 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { code?: string }).code).toBe('USER_008_QUERY_REQUIRED');
  });
});

describe('useUserRoleAssignments — ESAVI-USERROLE-002A', () => {
  it('lee la lista entera, no la página por defecto de diez', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get(`http://localhost:4500/api/user-roles/user/${USER_ID}`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 0, user: { userId: USER_ID }, rows: [] },
        });
      }),
    );
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useUserRoleAssignments(USER_ID), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedUrl!.searchParams.get('limit')).toBe('100');
    expect(queryClient.getQueryData(['appUserRole', 'byUser', USER_ID])).toBeDefined();
  });

  it('sin userId no pide nada', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUserRoleAssignments(''), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
  });
});

describe('useAppRoles — ESAVI-APPROLE-002A', () => {
  it('pide /api/roles con limit 100 y guarda en ["appRole","list"]', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/roles', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useAppRoles(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedUrl!.searchParams.get('limit')).toBe('100');
    expect(queryClient.getQueryData(['appRole', 'list'])).toEqual({ count: 0, rows: [] });
  });
});

describe('las dos mutaciones de roles invalidan las dos queries de §3.4', () => {
  it('useBulkAssignRoles invalida las asignaciones y la ficha del usuario', async () => {
    server.use(
      http.post('http://localhost:4500/api/user-roles/bulk', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { created: 1 } }),
      ),
    );
    const { Wrapper, queryClient } = createWrapper();
    const invalidated: unknown[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (filters) => {
      invalidated.push(filters?.queryKey);
      return original(filters);
    };

    const { result } = renderHook(() => useBulkAssignRoles(), { wrapper: Wrapper });
    result.current.mutate({ userId: USER_ID, roleIds: [ROLE_ADMIN] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated).toEqual([
      ['appUserRole', 'byUser', USER_ID],
      ['user', 'detail', USER_ID],
    ]);
  });

  it('useRevokeUserRole borra por userRoleId e invalida por userId', async () => {
    let deletedPath = '';
    server.use(
      http.delete('http://localhost:4500/api/user-roles/:id', ({ params }) => {
        deletedPath = String(params.id);
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );
    const { Wrapper, queryClient } = createWrapper();
    const invalidated: unknown[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (filters) => {
      invalidated.push(filters?.queryKey);
      return original(filters);
    };

    const { result } = renderHook(() => useRevokeUserRole(), { wrapper: Wrapper });
    result.current.mutate({ userRoleId: 'assignment-9', userId: USER_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deletedPath).toBe('assignment-9');
    expect(invalidated).toEqual([
      ['appUserRole', 'byUser', USER_ID],
      ['user', 'detail', USER_ID],
    ]);
  });
});

describe('userResource — la declaración de createResource', () => {
  it('expone las seis operaciones del CRUD', () => {
    expect(typeof userResource.useList).toBe('function');
    expect(typeof userResource.useOne).toBe('function');
    expect(typeof userResource.useCreate).toBe('function');
    expect(typeof userResource.useUpdate).toBe('function');
    expect(typeof userResource.useDeactivate).toBe('function');
    expect(typeof userResource.useActivate).toBe('function');
  });

  it('con ADMIN y el toggle activo pide /api/users/admin, no /api/users', async () => {
    let path = '';
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }] },
        }),
      ),
      http.get('http://localhost:4500/api/users/admin', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => userResource.useList({ pageSize: 10, includeInactive: true }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(path).toBe('/api/users/admin');
  });
});
