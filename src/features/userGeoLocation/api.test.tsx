import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  useBulkAssignGeoLocations,
  useGeoAssignmentsByUser,
  useReassignGeoLocation,
  useUserGeoCoverage,
} from './api';

const server = setupServer();

const USER_ID = 'user-1';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';

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

function signInAs(level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level }] },
      }),
    ),
  );
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

function emptyList() {
  return { count: 0, user: { userId: USER_ID }, rows: [] };
}

describe('useGeoAssignmentsByUser — ESAVI-USERGEO-002A / 002B', () => {
  it('con el toggle apagado pide la ruta pública con current=true', async () => {
    signInAs(50);
    let url: URL | null = null;
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_ID}`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyList() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useGeoAssignmentsByUser(USER_ID, { page: 1, pageSize: 10, coverageAll: false }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(url!.pathname).toBe(`/api/user-geo-locations/user/${USER_ID}`);
    expect(url!.searchParams.get('current')).toBe('true');
  });

  it('con el toggle encendido pide la ruta de administración con current=false', async () => {
    signInAs(50);
    let url: URL | null = null;
    server.use(
      http.get(
        `http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`,
        ({ request }) => {
          url = new URL(request.url);
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyList() });
        },
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useGeoAssignmentsByUser(USER_ID, { page: 1, pageSize: 10, coverageAll: true }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(url!.pathname).toBe(`/api/user-geo-locations/admin/user/${USER_ID}`);
    expect(url!.searchParams.get('current')).toBe('false');
  });

  it('pagina en el servidor, con limit y offset', async () => {
    signInAs(50);
    let url: URL | null = null;
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_ID}`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyList() });
      }),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useGeoAssignmentsByUser(USER_ID, { page: 3, pageSize: 10, coverageAll: false }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(url!.searchParams.get('limit')).toBe('10');
    expect(url!.searchParams.get('offset')).toBe('20');
  });
});

// El punto que el spec llama «el que más importa» de §3.4: la cobertura efectiva tiene un
// staleTime de 30 minutos y alimenta el filtro de unidades de salud del wizard de FE10. Si una
// mutación invalidara sólo el listado, ampliar la cobertura de alguien no surtiría efecto en
// media hora.
describe('invalidación de la clave entera tras cada escritura — SPEC FE22 §3.4', () => {
  function mockCoverage(onRead: () => void) {
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_ID}/coverage`, () => {
        onRead();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { assigned: [], coverage: [], count: 0 },
        });
      }),
    );
  }

  it('tras un 007 se vuelve a pedir la cobertura, pese a su staleTime', async () => {
    signInAs(50);
    let coverageReads = 0;
    mockCoverage(() => {
      coverageReads += 1;
    });
    server.use(
      http.post('http://localhost:4500/api/user-geo-locations/bulk', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [] } }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({ coverage: useUserGeoCoverage(USER_ID), bulk: useBulkAssignGeoLocations() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.coverage.isSuccess).toBe(true));
    expect(coverageReads).toBe(1);

    result.current.bulk.mutate({ userId: USER_ID, geoLocationIds: [LOCATION_A] });

    await waitFor(() => expect(coverageReads).toBe(2));
  });

  it('tras un 006 también', async () => {
    signInAs(50);
    let coverageReads = 0;
    mockCoverage(() => {
      coverageReads += 1;
    });
    server.use(
      http.patch('http://localhost:4500/api/user-geo-locations/reassign/ugl-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: {} }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({ coverage: useUserGeoCoverage(USER_ID), reassign: useReassignGeoLocation() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.coverage.isSuccess).toBe(true));
    expect(coverageReads).toBe(1);

    result.current.reassign.mutate({
      userGeoLocationId: 'ugl-1',
      data: { geoLocationId: LOCATION_A },
    });

    await waitFor(() => expect(coverageReads).toBe(2));
  });
});

describe('useUserGeoCoverage — ESAVI-USERGEO-008', () => {
  it('conserva la firma que FE10 consume: assigned, coverage y count', async () => {
    signInAs(25);
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_ID}/coverage`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            assigned: [{ geoLocationId: LOCATION_A, name: 'Pichincha', level: 1 }],
            coverage: [
              { geoLocationId: LOCATION_A, name: 'Pichincha', level: 1, parentGeoLocationId: null },
              { geoLocationId: 'c-1', name: 'Quito', level: 2, parentGeoLocationId: LOCATION_A },
            ],
            count: 2,
          },
        }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUserGeoCoverage(USER_ID), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // `coverage` incluye los nodos de `assigned`: es la expansión completa, no el complemento.
    expect(result.current.data?.coverage).toHaveLength(2);
    expect(result.current.data?.count).toBe(2);
  });
});
