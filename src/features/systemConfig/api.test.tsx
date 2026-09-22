import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  systemConfigResource,
  useCountryIsoCode,
  useSyncSystemConfigDefaults,
  useSystemConfigHistory,
} from './api';

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

function createWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

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

describe('systemConfigResource — toggle de inactivas (SPEC FE19 §4 paso 2)', () => {
  it('con includeInactive y nivel ADMIN, pega a /system-configs/admin', async () => {
    mockCurrentUser('ADMIN', 50);
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/system-configs/admin', () => {
        hitAdmin = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderHook(() => systemConfigResource.useList({ pageSize: 10, includeInactive: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hitAdmin).toBe(true));
  });
});

describe('useSystemConfigHistory — ESAVI-SYSCONF-007', () => {
  it('pide limit/offset de la página pedida, y no llama si enabled es false', async () => {
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/system-configs/sc-1/history', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSystemConfigHistory('sc-1', { page: 2, pageSize: 20 }, enabled),
      { wrapper: createWrapper(), initialProps: { enabled: false } },
    );

    expect(requestedUrl).toBeNull();

    rerender({ enabled: true });

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('limit')).toBe('20');
    expect(requestedUrl!.searchParams.get('offset')).toBe('20');
  });
});

describe('useSyncSystemConfigDefaults — ESAVI-SYSCONF-008', () => {
  it('hace un POST sin cuerpo e invalida la raíz de systemConfig', async () => {
    let requestBody: unknown = 'not-called';
    let listCallCount = 0;
    server.use(
      http.get('http://localhost:4500/api/system-configs', () => {
        listCallCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.post('http://localhost:4500/api/system-configs/sync', async ({ request }) => {
        const text = await request.text();
        requestBody = text === '' ? null : text;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { created: [{ code: 'A', scope: 'GLOBAL' }], skipped: [] },
        });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(queryClient);

    const { result: listResult } = renderHook(
      () => systemConfigResource.useList({ pageSize: 10 }),
      { wrapper },
    );
    const { result: syncResult } = renderHook(() => useSyncSystemConfigDefaults(), { wrapper });

    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listCallCount).toBe(1);

    syncResult.current.mutate();

    await waitFor(() => expect(syncResult.current.isSuccess).toBe(true));
    expect(requestBody).toBeNull();
    expect(syncResult.current.data).toEqual({ created: [{ code: 'A', scope: 'GLOBAL' }], skipped: [] });
    await waitFor(() => expect(listCallCount).toBe(2));
  });
});
