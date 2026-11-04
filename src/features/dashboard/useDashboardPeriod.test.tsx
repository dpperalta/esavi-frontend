import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { toDashboardPeriodQuery, useDashboardPeriod } from './useDashboardPeriod';

const API = 'http://localhost:4500/api';
const USER_ID = '7a0d4e2c-1b3f-4a5e-8c9d-0e1f2a3b4c5d';
const IN_COVERAGE = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';
const OUT_OF_COVERAGE = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  vi.useRealTimers();
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0));
});

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: USER_ID,
          displayName: 'Ana',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
  );
}

function mockCoverage() {
  server.use(
    http.get(`${API}/user-geo-locations/user/${USER_ID}/coverage`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          assigned: [{ geoLocationId: IN_COVERAGE, name: 'Pichincha', level: 1 }],
          coverage: [
            { geoLocationId: IN_COVERAGE, name: 'Pichincha', level: 1, parentGeoLocationId: null },
          ],
          count: 1,
        },
      }),
    ),
  );
}

function renderPeriod(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/${search}`]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return renderHook(() => useDashboardPeriod(), { wrapper: Wrapper });
}

describe('toDashboardPeriodQuery', () => {
  const TODAY = '2026-11-03';

  it('?range=7d envía solo from = hoy − 6, sin to', () => {
    expect(toDashboardPeriodQuery({ mode: 'range', range: '7d' }, TODAY)).toEqual({
      from: '2026-10-28',
    });
  });

  it('?range=365d cruza el año sin problema', () => {
    expect(toDashboardPeriodQuery({ mode: 'range', range: '365d' }, TODAY)).toEqual({
      from: '2025-11-04',
    });
  });

  it('un personalizado envía from y to', () => {
    expect(
      toDashboardPeriodQuery({ mode: 'custom', from: '2026-10-01', to: '2026-10-31' }, TODAY),
    ).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('el default envía {}', () => {
    expect(toDashboardPeriodQuery({ mode: 'default' }, TODAY)).toEqual({});
  });
});

describe('useDashboardPeriod', () => {
  it('con today = 2026-11-03 y ?range=7d la query es { from: 2026-10-28 }', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const { result } = renderPeriod('?range=7d');

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.query).toEqual({ from: '2026-10-28' });
  });

  it('ANALYTICS envía el geoLocationId de la URL sin pedir la cobertura', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const { result } = renderPeriod(`?geoLocationId=${IN_COVERAGE}`);

    await waitFor(() => expect(result.current.query.geoLocationId).toBe(IN_COVERAGE));
    expect(result.current.isReady).toBe(true);
    expect(result.current.geoLocationIdDiscarded).toBe(false);
  });

  it('INVESTIGATOR conserva un geoLocationId que está en coverage', async () => {
    mockCurrentUser('INVESTIGATOR', 30);
    mockCoverage();
    const { result } = renderPeriod(`?range=30d&geoLocationId=${IN_COVERAGE}`);

    await waitFor(() => expect(result.current.isReady).toBe(true));
    await waitFor(() => expect(result.current.query.geoLocationId).toBe(IN_COVERAGE));
    expect(result.current.geoLocationIdDiscarded).toBe(false);
  });

  it('INVESTIGATOR descarta, con aviso, un geoLocationId fuera de coverage', async () => {
    mockCurrentUser('INVESTIGATOR', 30);
    mockCoverage();
    const { result } = renderPeriod(`?range=30d&geoLocationId=${OUT_OF_COVERAGE}`);

    await waitFor(() => expect(result.current.geoLocationIdDiscarded).toBe(true));
    expect(result.current.isReady).toBe(true);
    expect(result.current.query).toEqual({ from: '2026-10-05' });
  });

  it('ADMIN envía el geoLocationId sin pedir la cobertura', async () => {
    mockCurrentUser('ADMIN', 50);
    const { result } = renderPeriod(`?geoLocationId=${OUT_OF_COVERAGE}`);

    await waitFor(() => expect(result.current.query.geoLocationId).toBe(OUT_OF_COVERAGE));
    expect(result.current.isReady).toBe(true);
  });
});
