import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CASE_WORKFLOW_STATUS_CODES } from '@/contracts/declared/caseWorkflow';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { DashboardPeriodQuery } from '@/contracts/dashboard';
import { EsaviApiError } from '@/shared/api/types';
import {
  useBatchAlerts,
  useDistributions,
  useEpiCurve,
  useIndicators,
  usePendingWork,
  useRecentActivity,
  useSystemActivity,
} from './api';
import { batchAlertsFixture } from './batchAlertsFixture';
import { distributionsFixture } from './distributionsFixture';
import { epiCurveFixture } from './epiCurveFixture';
import { indicatorsFixture } from './indicatorsFixture';
import { pendingWorkFixture } from './pendingWorkFixture';
import { recentActivityFixture } from './recentActivityFixture';
import { systemActivityFixture } from './systemActivityFixture';

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
  return { Wrapper, queryClient };
}

describe('usePendingWork — ESAVI-DASH-006', () => {
  it('desenvuelve el envelope y expone generatedAt', async () => {
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingWork(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.generatedAt).toBe('2026-11-04T14:05:00.000Z');
    expect(result.current.data?.openCases).toBe(21);
  });

  it('montarlo dos veces en menos de 60 s hace una sola petición', async () => {
    let requests = 0;
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const first = renderHook(() => usePendingWork(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePendingWork(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(requests).toBe(1);
  });

  // SPEC FE34 §7 — the hand-declared codes must match the eight states the backend returns.
  it('los statusCode del embudo coinciden con CASE_WORKFLOW_STATUS_CODES', async () => {
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingWork(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.funnel.map((row) => row.statusCode)).toEqual([
      ...CASE_WORKFLOW_STATUS_CODES,
    ]);
  });
});

describe('useIndicators — ESAVI-DASH-007', () => {
  const INDICATORS_URL = 'http://localhost:4500/api/dashboard/indicators';

  it('envía la query como parámetros y desenvuelve el envelope', async () => {
    let received: URLSearchParams | undefined;
    server.use(
      http.get(INDICATORS_URL, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useIndicators({ from: '2026-10-01', to: '2026-10-31' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received?.get('from')).toBe('2026-10-01');
    expect(received?.get('to')).toBe('2026-10-31');
    expect(received?.has('geoLocationId')).toBe(false);
    expect(result.current.data?.volume.total.current).toBe(42);
  });

  it('cambiar de periodo no vacía data mientras llega la respuesta nueva', async () => {
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    server.use(
      http.get(INDICATORS_URL, async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from === '2026-10-28') {
          await secondGate;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: indicatorsFixture({
              volume: { ...indicatorsFixture().volume, total: { current: 7, previous: 3 } },
            }),
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: DashboardPeriodQuery }) => useIndicators(query),
      { wrapper: Wrapper, initialProps: { query: {} } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ query: { from: '2026-10-28' } });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.volume.total.current).toBe(42);

    releaseSecond();
    await waitFor(() => expect(result.current.data?.volume.total.current).toBe(7));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('un 400 expone status 400 sin lanzar y sin reintentar', async () => {
    let requests = 0;
    server.use(
      http.get(INDICATORS_URL, () => {
        requests += 1;
        return HttpResponse.json(
          { ok: false, message: 'Periodo inválido', code: 'DASH_007_VALIDATION_ERROR', errors: [] },
          { status: 400 },
        );
      }),
    );
    // The hook's own `retry` overrides the wrapper's `retry: false`, so one request here is the
    // hook's rule, not the test client's.
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useIndicators({ from: '2030-01-01' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).status).toBe(400);
    expect(requests).toBe(1);
  });

  it('enabled: false no hace ninguna petición', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useIndicators({}, { enabled: false }), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useEpiCurve — ESAVI-DASH-008', () => {
  const EPI_CURVE_URL = 'http://localhost:4500/api/dashboard/epi-curve';

  it('envía la query como parámetros y desenvuelve el envelope', async () => {
    let received: URLSearchParams | undefined;
    server.use(
      http.get(EPI_CURVE_URL, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: epiCurveFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useEpiCurve({ from: '2026-10-05', to: '2026-11-03', geoLocationId: 'geo-1' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received?.get('from')).toBe('2026-10-05');
    expect(received?.get('to')).toBe('2026-11-03');
    expect(received?.get('geoLocationId')).toBe('geo-1');
    expect(result.current.data?.weeks.map((week) => week.label)).toEqual([
      '2026-SE40',
      '2026-SE41',
      '2026-SE42',
      '2026-SE43',
      '2026-SE44',
    ]);
  });

  it('cambiar de periodo no vacía data mientras llega la respuesta nueva', async () => {
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const lastWeekOnly = epiCurveFixture().weeks.slice(-1);
    server.use(
      http.get(EPI_CURVE_URL, async ({ request }) => {
        if (new URL(request.url).searchParams.get('from') === '2026-10-28') {
          await secondGate;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: epiCurveFixture({ weeks: lastWeekOnly }),
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: epiCurveFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: DashboardPeriodQuery }) => useEpiCurve(query),
      { wrapper: Wrapper, initialProps: { query: {} } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ query: { from: '2026-10-28' } });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.weeks).toHaveLength(5);

    releaseSecond();
    await waitFor(() => expect(result.current.data?.weeks).toHaveLength(1));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('un 400 expone status 400 sin lanzar y sin reintentar', async () => {
    let requests = 0;
    server.use(
      http.get(EPI_CURVE_URL, () => {
        requests += 1;
        return HttpResponse.json(
          { ok: false, message: 'Periodo inválido', code: 'DASH_008_VALIDATION_ERROR', errors: [] },
          { status: 400 },
        );
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useEpiCurve({ from: '2030-01-01' }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).status).toBe(400);
    expect(requests).toBe(1);
  });

  it('enabled: false no hace ninguna petición', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useEpiCurve({}, { enabled: false }), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useDistributions — ESAVI-DASH-009', () => {
  const DISTRIBUTIONS_URL = 'http://localhost:4500/api/dashboard/distributions';

  it('envía la query como parámetros y desenvuelve el envelope', async () => {
    let received: URLSearchParams | undefined;
    server.use(
      http.get(DISTRIBUTIONS_URL, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: distributionsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDistributions({ from: '2026-10-05', to: '2026-11-03', geoLocationId: 'geo-1' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received?.get('from')).toBe('2026-10-05');
    expect(received?.get('to')).toBe('2026-11-03');
    expect(received?.get('geoLocationId')).toBe('geo-1');
    expect(result.current.data?.vaccines.items).toHaveLength(4);
    expect(result.current.data?.programmatic.investigatedCases).toBe(12);
  });

  it('cambiar de periodo no vacía data mientras llega la respuesta nueva', async () => {
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    server.use(
      http.get(DISTRIBUTIONS_URL, async ({ request }) => {
        if (new URL(request.url).searchParams.get('from') === '2026-10-28') {
          await secondGate;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: distributionsFixture({
              vaccines: {
                items: [],
                others: { cases: 0, serious: 0 },
                casesWithoutSuspectedVaccine: 1,
              },
            }),
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: distributionsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: DashboardPeriodQuery }) => useDistributions(query),
      { wrapper: Wrapper, initialProps: { query: {} } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ query: { from: '2026-10-28' } });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.vaccines.items).toHaveLength(4);

    releaseSecond();
    await waitFor(() => expect(result.current.data?.vaccines.items).toHaveLength(0));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('un 400 expone status 400 sin lanzar y sin reintentar', async () => {
    let requests = 0;
    server.use(
      http.get(DISTRIBUTIONS_URL, () => {
        requests += 1;
        return HttpResponse.json(
          { ok: false, message: 'Periodo inválido', code: 'DASH_009_VALIDATION_ERROR', errors: [] },
          { status: 400 },
        );
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDistributions({ from: '2030-01-01' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).status).toBe(400);
    expect(requests).toBe(1);
  });

  it('enabled: false no hace ninguna petición', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDistributions({}, { enabled: false }), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useBatchAlerts — ESAVI-DASH-010', () => {
  const BATCH_ALERTS_URL = 'http://localhost:4500/api/dashboard/batch-alerts';

  it('envía la query como parámetros y desenvuelve el envelope', async () => {
    let received: URLSearchParams | undefined;
    server.use(
      http.get(BATCH_ALERTS_URL, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: batchAlertsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useBatchAlerts({ from: '2026-10-05', to: '2026-11-03', geoLocationId: 'geo-1' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received?.get('from')).toBe('2026-10-05');
    expect(received?.get('to')).toBe('2026-11-03');
    expect(received?.get('geoLocationId')).toBe('geo-1');
    expect(result.current.data?.alerts).toHaveLength(3);
    expect(result.current.data?.thresholds).toEqual({ minCases: 3, minSerious: 2 });
  });

  it('cambiar de periodo no vacía data mientras llega la respuesta nueva', async () => {
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    server.use(
      http.get(BATCH_ALERTS_URL, async ({ request }) => {
        if (new URL(request.url).searchParams.get('from') === '2026-10-28') {
          await secondGate;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: batchAlertsFixture({ total: 0, alerts: [] }),
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: batchAlertsFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: DashboardPeriodQuery }) => useBatchAlerts(query),
      { wrapper: Wrapper, initialProps: { query: {} } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ query: { from: '2026-10-28' } });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.alerts).toHaveLength(3);

    releaseSecond();
    await waitFor(() => expect(result.current.data?.alerts).toHaveLength(0));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('un 400 expone status 400 sin lanzar y sin reintentar', async () => {
    let requests = 0;
    server.use(
      http.get(BATCH_ALERTS_URL, () => {
        requests += 1;
        return HttpResponse.json(
          { ok: false, message: 'Periodo inválido', code: 'DASH_010_VALIDATION_ERROR', errors: [] },
          { status: 400 },
        );
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useBatchAlerts({ from: '2030-01-01' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).status).toBe(400);
    expect(requests).toBe(1);
  });

  it('enabled: false no hace ninguna petición', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useBatchAlerts({}, { enabled: false }), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useRecentActivity — ESAVI-DASH-011', () => {
  const RECENT_ACTIVITY_URL = 'http://localhost:4500/api/dashboard/recent-activity';

  it('desenvuelve el envelope y no envía parámetros', async () => {
    let received: URLSearchParams | undefined;
    server.use(
      http.get(RECENT_ACTIVITY_URL, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: recentActivityFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentActivity(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.windowDays).toBe(30);
    expect(result.current.data?.territory).toHaveLength(2);
    expect(result.current.data?.myCases[0]?.caseCode).toBe('ESAVI-0001');
    expect([...(received?.keys() ?? [])].filter((key) => key !== 'lang')).toEqual([]);
  });

  it('montarlo dos veces en menos de 60 s hace una sola petición', async () => {
    let requests = 0;
    server.use(
      http.get(RECENT_ACTIVITY_URL, () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: recentActivityFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const first = renderHook(() => useRecentActivity(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useRecentActivity(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(requests).toBe(1);
  });

  it('un 500 llega como EsaviApiError', async () => {
    server.use(
      http.get(RECENT_ACTIVITY_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'boom', code: 'DASH_011_FETCH_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentActivity(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EsaviApiError);
    expect((result.current.error as EsaviApiError).status).toBe(500);
  });
});

describe('useSystemActivity — ESAVI-DASH-012', () => {
  const SYSTEM_ACTIVITY_URL = 'http://localhost:4500/api/dashboard/system-activity';

  it('desenvuelve el envelope y expone generatedAt', async () => {
    server.use(
      http.get(SYSTEM_ACTIVITY_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: systemActivityFixture() }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useSystemActivity(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.generatedAt).toBe('2026-11-04T14:05:00.000Z');
    expect(result.current.data?.activeSessions).toBe(12);
    expect(result.current.data?.revocations7d).toHaveLength(6);
  });

  it('montarlo dos veces en menos de 60 s hace una sola petición', async () => {
    let requests = 0;
    server.use(
      http.get(SYSTEM_ACTIVITY_URL, () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: systemActivityFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const first = renderHook(() => useSystemActivity(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useSystemActivity(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(requests).toBe(1);
  });
});
