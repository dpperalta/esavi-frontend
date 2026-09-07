import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  useNonSevereNotificationByCase,
  useNotificationByCase,
  useSevereNotificationByCase,
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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useNotificationByCase — ESAVI-NOTIFCN-006', () => {
  it('con enabled:false no pega a la red', () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/notifications/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: false, message: 'not found', code: 'X' }, { status: 404 });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useNotificationByCase('case-1', false), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(hit).toBe(false);
  });

  it('con enabled:true lee la cabecera del caso', async () => {
    server.use(
      http.get('http://localhost:4500/api/notifications/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { notificationId: 'n-1', notificationType: 'SEVERE' },
        }),
      ),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useNotificationByCase('case-1', true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.notificationId).toBe('n-1');
  });
});

// Criterio de aceptación (SPEC FE12a §5): con un caso SEVERE la pantalla no llama a
// non-severe-notifications/case/:id, y al revés — cada rama sólo se lee cuando corresponde a
// `notificationType`, nunca las dos a la vez.
describe('useSevereNotificationByCase / useNonSevereNotificationByCase — ESAVI-SEVNOT-006 / ESAVI-NSEVNOT-006', () => {
  it('con notificationType SEVERE, sólo pega a severe-notifications/case/:id', async () => {
    let severeHit = false;
    let nonSevereHit = false;
    server.use(
      http.get('http://localhost:4500/api/severe-notifications/case/case-1', () => {
        severeHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { notificationId: 'n-1' } });
      }),
      http.get('http://localhost:4500/api/non-severe-notifications/case/case-1', () => {
        nonSevereHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { notificationId: 'n-1' } });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(
      () => ({
        severe: useSevereNotificationByCase('case-1', 'SEVERE'),
        nonSevere: useNonSevereNotificationByCase('case-1', 'SEVERE'),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.severe.isSuccess).toBe(true));
    expect(severeHit).toBe(true);
    expect(nonSevereHit).toBe(false);
  });

  it('con notificationType NON_SEVERE, sólo pega a non-severe-notifications/case/:id', async () => {
    let severeHit = false;
    let nonSevereHit = false;
    server.use(
      http.get('http://localhost:4500/api/severe-notifications/case/case-1', () => {
        severeHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { notificationId: 'n-1' } });
      }),
      http.get('http://localhost:4500/api/non-severe-notifications/case/case-1', () => {
        nonSevereHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { notificationId: 'n-1' } });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(
      () => ({
        severe: useSevereNotificationByCase('case-1', 'NON_SEVERE'),
        nonSevere: useNonSevereNotificationByCase('case-1', 'NON_SEVERE'),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.nonSevere.isSuccess).toBe(true));
    expect(nonSevereHit).toBe(true);
    expect(severeHit).toBe(false);
  });
});
