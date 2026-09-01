import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { GeoLocation } from '@/contracts/declared/geoLocation';
import { GeoLocationListPage } from './GeoLocationListPage';

const server = setupServer();

const LVL_COUNTRY = '11111111-1111-4111-8111-111111111111';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
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

function mockLevelTypes() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLevelTypeId: LVL_COUNTRY,
              code: 'COUNTRY',
              name: 'País',
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
  );
}

function makeRow(overrides: Partial<GeoLocation> = {}): GeoLocation {
  return {
    geoLocationId: 'gl-1',
    geoLevelTypeId: LVL_COUNTRY,
    parentGeoLocationId: null,
    name: 'Ecuador',
    officialName: null,
    shortName: null,
    isoCode: null,
    externalCode: 'EC',
    level: 1,
    latitude: null,
    longitude: null,
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/geo-locations') {
  const router = createMemoryRouter(
    [{ path: '/geo-locations', element: <GeoLocationListPage /> }],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('GeoLocationListPage — columna Nivel resuelve el nombre', () => {
  it('muestra el nombre del nivel, no el id crudo, una vez resuelto el mapa', async () => {
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('País').length).toBeGreaterThan(0));
    expect(screen.queryByText(LVL_COUNTRY)).not.toBeInTheDocument();
  });
});

describe('GeoLocationListPage — filtros en la URL', () => {
  it('?geoLevelId=<id>&q=<texto>&page=2 sobrevive al refresco y se reproduce en otra pestaña', async () => {
    signInAs('ADMIN', 50);
    mockLevelTypes();
    const receivedParams: URLSearchParams[] = [];
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        receivedParams.push(url.searchParams);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } });
      }),
    );

    renderPage(`/geo-locations?geoLevelId=${LVL_COUNTRY}&q=quito&page=2`);

    // <GeoLocationPicker> (the "parent" filter) also hits /geo-locations, with its own
    // `pageSize: 100` request — distinguish the list's own request by its `limit` (pageSize: 10).
    await waitFor(() =>
      expect(receivedParams.some((params) => params.get('limit') === '10')).toBe(true),
    );
    const listRequest = receivedParams.find((params) => params.get('limit') === '10')!;
    expect(listRequest.get('geoLevelId')).toBe(LVL_COUNTRY);
    expect(listRequest.get('name')).toBe('quito');
    expect(listRequest.get('code')).toBe('quito');
    expect(listRequest.get('offset')).toBe('10');
  });

  it('cambiar el filtro de nivel deja page en 1', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    const router = renderPage('/geo-locations?page=2');

    await waitFor(() => expect(screen.getAllByText('Ecuador').length).toBeGreaterThan(0));

    await user.click(screen.getByLabelText('Nivel geográfico'));
    await user.click(await screen.findByRole('option', { name: 'País' }));

    await waitFor(() => expect(router.state.location.search).toBe(`?geoLevelId=${LVL_COUNTRY}`));
  });

  it('buscar por q pega a geo-locations?name=<texto>&code=<texto>', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);
    mockLevelTypes();
    const receivedParams: URLSearchParams[] = [];
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        receivedParams.push(url.searchParams);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } });
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Ecuador').length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'quito');

    await waitFor(
      () => {
        // <GeoLocationPicker> (the "parent" filter) also hits /geo-locations with `limit: 100`
        // — distinguish the list's own requests by their `limit` (pageSize: 10) and take the
        // most recent one, since the search fires once per keystroke's settled debounce.
        const listRequests = receivedParams.filter((params) => params.get('limit') === '10');
        const listRequest = listRequests[listRequests.length - 1];
        expect(listRequest?.get('name')).toBe('quito');
        expect(listRequest?.get('code')).toBe('quito');
      },
      { timeout: 3000 },
    );
  });
});

describe('GeoLocationListPage — vacío con filtros', () => {
  it('pinta emptyFiltered con botón de limpiar, no el vacío genérico', async () => {
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage(`/geo-locations?geoLevelId=${LVL_COUNTRY}`);

    expect(await screen.findByText('Ninguna ubicación coincide con los filtros.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });
});
