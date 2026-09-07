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
  useNotificationEventsByCase,
  useNotificationMedicationsByCase,
  useSevereNotificationByCase,
  useWhodrugProductSearch,
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
        severe: useSevereNotificationByCase('case-1', 'SEVERE', true),
        nonSevere: useNonSevereNotificationByCase('case-1', 'SEVERE', true),
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
        severe: useSevereNotificationByCase('case-1', 'NON_SEVERE', true),
        nonSevere: useNonSevereNotificationByCase('case-1', 'NON_SEVERE', true),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.nonSevere.isSuccess).toBe(true));
    expect(nonSevereHit).toBe(true);
    expect(severeHit).toBe(false);
  });

  it('con stageExists:false no pega a la red — un caso fresco no tiene cabecera todavía', () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/severe-notifications/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: false, message: 'not found', code: 'X' }, { status: 404 });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useSevereNotificationByCase('case-1', 'SEVERE', false), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(hit).toBe(false);
  });

  // La cabecera existe (stageExists:true) pero la rama todavía no — justo el fallo parcial que
  // SPEC FE12a §4 paso 12 existe para recuperar. `SEVNOT_006_NOT_FOUND`/`NSEVNOT_006_NOT_FOUND`
  // resuelven a `null`, no a un error que rompa la pantalla.
  it('con la rama sin crear todavía, SEVNOT_006_NOT_FOUND resuelve a null en vez de isError', async () => {
    server.use(
      http.get('http://localhost:4500/api/severe-notifications/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrada', code: 'SEVNOT_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useSevereNotificationByCase('case-1', 'SEVERE', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('con la rama sin crear todavía, NSEVNOT_006_NOT_FOUND resuelve a null en vez de isError', async () => {
    server.use(
      http.get('http://localhost:4500/api/non-severe-notifications/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrada', code: 'NSEVNOT_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useNonSevereNotificationByCase('case-1', 'NON_SEVERE', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// SPEC FE12b §4 paso 6 — abrir el paso 4 con la cabecera creada dispara exactamente dos
// peticiones nuevas, las dos a `/case/:id`, y ninguna al buscador hasta que se teclea.
describe('useNotificationEventsByCase / useNotificationMedicationsByCase — ESAVI-NOTIFEVT-006 / ESAVI-NOTIFMED-006', () => {
  it('con enabled:true, las dos leen por caseId y no por notificationId', async () => {
    server.use(
      http.get('http://localhost:4500/api/notification-events/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [{ eventId: 'e-1', esaviName: 'Fiebre alta' }] },
        }),
      ),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 0, rows: [] },
        }),
      ),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(
      () => ({
        events: useNotificationEventsByCase('case-1', true),
        medications: useNotificationMedicationsByCase('case-1', true),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.events.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.medications.isSuccess).toBe(true));
    expect(result.current.events.data?.count).toBe(1);
    expect(result.current.medications.data?.count).toBe(0);
  });

  it('con enabled:false (sin cabecera todavía) ninguna de las dos pega a la red', () => {
    let eventsHit = false;
    let medicationsHit = false;
    server.use(
      http.get('http://localhost:4500/api/notification-events/case/case-1', () => {
        eventsHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () => {
        medicationsHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(
      () => ({
        events: useNotificationEventsByCase('case-1', false),
        medications: useNotificationMedicationsByCase('case-1', false),
      }),
      { wrapper: Wrapper },
    );

    expect(result.current.events.fetchStatus).toBe('idle');
    expect(result.current.medications.fetchStatus).toBe('idle');
    expect(eventsHit).toBe(false);
    expect(medicationsHit).toBe(false);
  });
});

describe('useWhodrugProductSearch — ESAVI-WHODPROD-006', () => {
  it('con menos de 3 caracteres no llama al buscador', () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/whodrug-products/search', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { term: 'pa', count: 0, rows: [] } });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useWhodrugProductSearch('pa'), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(hit).toBe(false);
  });

  it('con 3 caracteres pide term y limit=20', async () => {
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/whodrug-products/search', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { term: 'par', count: 1, rows: [{ code: 'PAR001', name: 'Paracetamol' }] },
        });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useWhodrugProductSearch('par'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedUrl?.searchParams.get('term')).toBe('par');
    expect(requestedUrl?.searchParams.get('limit')).toBe('20');
  });
});
