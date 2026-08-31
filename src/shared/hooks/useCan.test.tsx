import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useCan } from './useCan';

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

describe('useCan', () => {
  it('devuelve true cuando el nivel efectivo alcanza el mínimo pedido', async () => {
    setAccessToken('a-token');
    tokenStore.setRefreshToken('a-refresh-token');
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: '1',
            roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }],
          },
        }),
      ),
    );

    const { result } = renderHook(() => useCan('USER'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('devuelve false cuando el nivel efectivo no alcanza el mínimo pedido', async () => {
    setAccessToken('a-token');
    tokenStore.setRefreshToken('a-refresh-token');
    let requestCount = 0;
    server.use(
      http.get('http://localhost:4500/api/users/me', () => {
        requestCount += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: '1',
            roles: [{ roleId: 'r1', name: 'ANALYTICS', code: 'ANALYTICS', level: 10 }],
          },
        });
      }),
    );

    const { result } = renderHook(() => useCan('ADMIN'), { wrapper: createWrapper() });

    await waitFor(() => expect(requestCount).toBe(1));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('devuelve false sin sesión, sin llamar a la red', () => {
    let requestCount = 0;
    server.use(
      http.get('http://localhost:4500/api/users/me', () => {
        requestCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    const { result } = renderHook(() => useCan('ANALYTICS'), { wrapper: createWrapper() });

    expect(result.current).toBe(false);
    expect(requestCount).toBe(0);
  });
});
