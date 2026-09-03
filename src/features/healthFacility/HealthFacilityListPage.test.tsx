import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { HealthFacilityListPage } from './HealthFacilityListPage';

const server = setupServer();

const LVL_COUNTRY = '11111111-1111-4111-8111-111111111111';
const GL_ECUADOR = '22222222-2222-4222-8222-222222222222';

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

function mockCatalogTypesEmpty() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockGeoLocationPicker() {
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
    http.get('http://localhost:4500/api/geo-locations', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLocationId: GL_ECUADOR,
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
            },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/geo-locations/${GL_ECUADOR}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          geoLocationId: GL_ECUADOR,
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
        },
      }),
    ),
  );
}

function makeFacility(overrides: Record<string, unknown> = {}) {
  return {
    healthFacilityId: 'hf-1',
    geoLocationId: GL_ECUADOR,
    facilityTypeItemId: null,
    parentHealthFacilityId: null,
    localCode: 'HF-001',
    name: 'Centro de salud Quito Sur',
    officialName: null,
    shortName: null,
    address: null,
    latitude: null,
    longitude: null,
    phone: null,
    email: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/health-facilities') {
  const router = createMemoryRouter(
    [{ path: '/health-facilities', element: <HealthFacilityListPage /> }],
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

describe('HealthFacilityListPage — sin ubicación ni término', () => {
  it('muestra el panel de invitación y no pide listado ni búsqueda', async () => {
    signInAs('USER', 25);
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/location/:id', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/health-facilities/search', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage();

    expect(
      await screen.findByText(
        'Elige una ubicación o escribe un término de búsqueda para ver las unidades de salud.',
      ),
    ).toBeInTheDocument();
    expect(hit).toBe(false);
  });
});

describe('HealthFacilityListPage — modo ubicación y URL persistente', () => {
  it('?geoLocationId=<id>&includeInactive=true&page=2 pega a /admin/location con limit/offset correctos', async () => {
    signInAs('ADMIN', 50);
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    let requestedUrl: URL | null = null;
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/admin/location/${GL_ECUADOR}`, ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeFacility()] } });
      }),
    );

    renderPage(`/health-facilities?geoLocationId=${GL_ECUADOR}&includeInactive=true&page=2`);

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    // Default `pageSize` preference is 10 (offset = (page - 1) * pageSize = 10 for page 2).
    expect(requestedUrl!.searchParams.get('limit')).toBe('10');
    expect(requestedUrl!.searchParams.get('offset')).toBe('10');
    expect(await screen.findByRole('switch')).toBeChecked();
  });
});

describe('HealthFacilityListPage — toggle de inactivos (hallazgo C)', () => {
  it('con rol ADMIN, escribir dos caracteres oculta el toggle y cambia la petición a /search', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    let searchHit = false;
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeFacility()] } }),
      ),
      http.get('http://localhost:4500/api/health-facilities/search', () => {
        searchHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage(`/health-facilities?geoLocationId=${GL_ECUADOR}`);

    expect(await screen.findByRole('switch')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'ho');

    await waitFor(() => expect(searchHit).toBe(true), { timeout: 3000 });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('con rol USER el toggle no se renderiza ni en modo ubicación ni en modo búsqueda', async () => {
    signInAs('USER', 25);
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeFacility()] } }),
      ),
    );

    renderPage(`/health-facilities?geoLocationId=${GL_ECUADOR}`);

    await waitFor(() => expect(screen.getAllByText('Centro de salud Quito Sur').length).toBeGreaterThan(0));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('HealthFacilityListPage — borrar el término vuelve al listado por ubicación', () => {
  it('limpiar q en modo búsqueda vuelve a pedir /location/:id', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    let locationHit = false;
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () => {
        locationHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeFacility()] } });
      }),
      http.get('http://localhost:4500/api/health-facilities/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage(`/health-facilities?geoLocationId=${GL_ECUADOR}&q=ho`);

    await screen.findByText('Ninguna unidad de salud coincide con la búsqueda.');
    locationHit = false;

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    await waitFor(() => expect(locationHit).toBe(true));
    await waitFor(() => expect(screen.getAllByText('Centro de salud Quito Sur').length).toBeGreaterThan(0));
  });
});

describe('HealthFacilityListPage — columna Tipo', () => {
  it('con la query del catálogo aún cargando, no revienta y luego resuelve el nombre', async () => {
    signInAs('USER', 25);
    mockGeoLocationPicker();
    server.use(
      http.get('http://localhost:4500/api/catalog-types', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogTypeId: 'ct-hfac',
                code: 'healthFacilityType',
                name: 'Tipo de unidad de salud',
                description: null,
                sortOrder: 1,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        });
      }),
      http.get('http://localhost:4500/api/catalog-items/type/ct-hfac', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogItemId: 'ci-1',
                catalogTypeId: 'ct-hfac',
                code: 'HEALTH_CENTER',
                name: 'Centro de salud',
                value: null,
                isValueLocked: false,
                description: null,
                sortOrder: 1,
                metadata: null,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        }),
      ),
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeFacility({ facilityTypeItemId: 'ci-1' })] },
        }),
      ),
    );

    renderPage(`/health-facilities?geoLocationId=${GL_ECUADOR}`);

    await waitFor(() => expect(screen.getAllByText('Centro de salud Quito Sur').length).toBeGreaterThan(0));
    // While the catalog query is still resolving, no crash — the cell falls back to '—' and
    // then resolves the name once `itemsList` lands.
    await waitFor(() => expect(screen.getAllByText('Centro de salud').length).toBeGreaterThan(0));
  });
});
