import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useAppRoleDetail, useRoleHolders } from './api';

const server = setupServer();

const ROLE_ID = '11111111-1111-4111-8111-111111111111';

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

describe('useAppRoleDetail — ESAVI-APPROLE-003', () => {
  it('no pide el detalle mientras el diálogo está cerrado', async () => {
    let calls = 0;
    server.use(
      http.get(`http://localhost:4500/api/roles/${ROLE_ID}`, () => {
        calls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useAppRoleDetail(ROLE_ID, false), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(calls).toBe(0);
  });

  it('pide el detalle una vez con activeUserCount al abrirse', async () => {
    let calls = 0;
    server.use(
      http.get(`http://localhost:4500/api/roles/${ROLE_ID}`, () => {
        calls += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { roleId: ROLE_ID, code: 'SUPERVISOR', activeUserCount: 4 },
        });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useAppRoleDetail(ROLE_ID, true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(1);
    expect(result.current.data?.activeUserCount).toBe(4);
  });
});

describe('useRoleHolders — ESAVI-USERROLE-006', () => {
  it('pagina con limit/offset y devuelve el rol fuera de las filas', async () => {
    let requestUrl = '';
    server.use(
      http.get(`http://localhost:4500/api/user-roles/role/${ROLE_ID}`, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            role: { roleId: ROLE_ID, code: 'SUPERVISOR', name: 'SUPERVISOR', level: 60 },
            rows: [
              {
                userRoleId: 'ur-1',
                userId: 'user-1',
                roleId: ROLE_ID,
                assignedByUserId: null,
                isActive: true,
                user: {
                  userId: 'user-1',
                  username: 'ana',
                  firstName: 'Ana',
                  lastName: 'Pérez',
                  email: 'ana@example.org',
                },
              },
            ],
          },
        });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRoleHolders(ROLE_ID, { page: 2, pageSize: 10 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestUrl).toContain('limit=10');
    expect(requestUrl).toContain('offset=10');
    expect(result.current.data?.role.level).toBe(60);
    expect(result.current.data?.rows[0].user.email).toBe('ana@example.org');
  });

  it('no pide nada sin rol, que es como el Sheet queda cerrado', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRoleHolders('', { pageSize: 10 }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
  });
});
