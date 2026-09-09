import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useSystemConfigByCode } from './useSystemConfigByCode';

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

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useSystemConfigByCode — ESAVI-SYSCONF-006', () => {
  it('con la fila presente, devuelve el `catalogItemId` guardado en `value`', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM',
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              systemConfigId: 'sc-1',
              code: 'PREGNANCY_FEMALE_SEX_ITEM',
              name: 'Ítem de sexo femenino',
              description: null,
              value: 'catalog-item-female',
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

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSystemConfigByCode('PREGNANCY_FEMALE_SEX_ITEM'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.value).toBe('catalog-item-female');
  });

  it('con la fila ausente (404), resuelve a `null` sin propagar un error', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM',
        () =>
          HttpResponse.json(
            { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
            { status: 404 },
          ),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSystemConfigByCode('PREGNANCY_FEMALE_SEX_ITEM'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('con un 500, propaga el error en vez de tratarlo como «no sembrada»', async () => {
    server.use(
      http.get(
        'http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM',
        () => HttpResponse.json({ ok: false, message: 'boom', code: 'UNKNOWN_ERROR' }, { status: 500 }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSystemConfigByCode('PREGNANCY_FEMALE_SEX_ITEM'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('una segunda montura dentro de la ventana de `staleTime` no repite la petición', async () => {
    const handler = vi.fn(() =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          systemConfigId: 'sc-1',
          code: 'PREGNANCY_FEMALE_SEX_ITEM',
          name: 'Ítem de sexo femenino',
          description: null,
          value: 'catalog-item-female',
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
    );
    server.use(
      http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', handler),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(queryClient);

    function Probe() {
      useSystemConfigByCode('PREGNANCY_FEMALE_SEX_ITEM');
      return null;
    }

    const { unmount } = render(<Probe />, { wrapper });
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    unmount();

    render(<Probe />, { wrapper });
    await waitFor(() => expect(queryClient.getQueryState(['systemConfig', 'byCode', 'PREGNANCY_FEMALE_SEX_ITEM'])?.status).toBe('success'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
