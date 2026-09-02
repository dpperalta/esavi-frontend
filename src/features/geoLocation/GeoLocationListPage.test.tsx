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

  it('la «×» del filtro de nivel borra geoLevelId y deja page en 1 (SPEC FE05)', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    const router = renderPage(`/geo-locations?geoLevelId=${LVL_COUNTRY}&page=2`);

    await waitFor(() => expect(screen.getAllByText('Ecuador').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Limpiar selección' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
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

describe('GeoLocationListPage — botón único «Limpiar filtros» en el extremo derecho', () => {
  const GL_ECUADOR = '22222222-2222-4222-8222-222222222222';

  it('sin filtros activos, está deshabilitado en vez de oculto', async () => {
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Ecuador').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
  });

  it('con un filtro activo se habilita aunque haya resultados, y limpiarlo deja page en 1', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    const router = renderPage(`/geo-locations?geoLevelId=${LVL_COUNTRY}&page=2`);

    await waitFor(() => expect(screen.getAllByText('Ecuador').length).toBeGreaterThan(0));

    const clearButton = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
  });

  it('«Limpiar filtros» (vacío filtrado) también limpia la cascada del picker de padre, no solo el valor final', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);
    mockLevelTypes();
    server.use(
      http.get(`http://localhost:4500/api/geo-locations/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ geoLocationId: GL_ECUADOR }) }),
      ),
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage(`/geo-locations?geoLevelId=${LVL_COUNTRY}&parentId=${GL_ECUADOR}`);

    // The parent picker mounts with a value already set, so it shows the read-only "Ecuador" +
    // «Cambiar» view (SPEC FE04 §3.7) — this is the exact scenario the user hit.
    expect(await screen.findByText('Ecuador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument();

    // Two "Limpiar filtros" buttons coexist here: the toolbar one (top, always available) and
    // <ResourceTable>'s own one on the empty-filtered panel (§3.8) — either does the same thing.
    const clearButtons = await screen.findAllByRole('button', { name: 'Limpiar filtros' });
    await user.click(clearButtons[0]);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cambiar' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Ecuador')).not.toBeInTheDocument();
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
    // Toolbar button (always available while filtered) + <ResourceTable>'s own empty-panel one.
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(2);
  });
});
