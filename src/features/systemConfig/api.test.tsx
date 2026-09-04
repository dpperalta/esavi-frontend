import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useCountryIsoCode } from './api';

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
  return Wrapper;
}

describe('useCountryIsoCode — ESAVI-SYSCONF-006', () => {
  it('con la fila presente, systemConfig gana sobre el respaldo de entorno', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE',
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              systemConfigId: 'sc-1',
              code: 'ESAVI_APP_COUNTRY_ISO_CODE',
              name: 'País',
              description: null,
              value: 'PER',
              valueType: 'string',
              scope: 'default',
              isEncrypted: false,
              isEditable: true,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          }),
      ),
    );

    const { result } = renderHook(() => useCountryIsoCode(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('PER');
  });

  it('con la fila ausente (404), cae al respaldo de entorno sin propagar error', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE',
        () =>
          HttpResponse.json(
            { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
            { status: 404 },
          ),
      ),
    );

    const { result } = renderHook(() => useCountryIsoCode(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('ECU');
    expect(result.current.isError).toBe(false);
  });

  it('con un 500, propaga el error en vez de caer al respaldo', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE',
        () =>
          HttpResponse.json(
            { ok: false, message: 'boom', code: 'UNKNOWN_ERROR' },
            { status: 500 },
          ),
      ),
    );

    const { result } = renderHook(() => useCountryIsoCode(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
