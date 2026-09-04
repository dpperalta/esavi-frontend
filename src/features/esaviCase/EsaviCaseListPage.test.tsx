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
import { EsaviCaseListPage } from './EsaviCaseListPage';

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

function mockGeoLocationPicker() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/geo-locations', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/geo-locations/:id', () =>
      HttpResponse.json({ ok: false, message: 'not found', code: 'GEOLOC_003_NOT_FOUND' }, { status: 404 }),
    ),
  );
}

function esaviCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case-1',
    caseCode: 'ESAVI-0001',
    reportDate: '2026-03-01',
    eventDate: '2026-02-20',
    isActive: true,
    patient: {
      patientId: 'patient-1',
      names: 'Ana',
      lastNames: 'Pérez',
      healthSystemCode: null,
    },
    healthFacility: {
      healthFacilityId: 'hfac-1',
      localCode: 'HF-1',
      name: 'Hospital Central',
      geoLocation: { geoLocationId: 'gl-1', name: 'Quito' },
    },
    ...overrides,
  };
}

function renderPage(initialPath = '/esavi-cases') {
  const router = createMemoryRouter(
    [
      { path: '/other', element: <p>otra pantalla</p> },
      { path: '/esavi-cases', element: <EsaviCaseListPage /> },
    ],
    { initialEntries: ['/other', initialPath] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('EsaviCaseListPage — filtros hacia el 002A/002B', () => {
  it('los filtros de la URL viajan al 002A como query params', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    let receivedParams: URLSearchParams | null = null;
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', ({ request }) => {
        receivedParams = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage('/esavi-cases?code=ab&geoLocationId=11111111-1111-4111-8111-111111111111&reportDate=2026-03-01');

    await waitFor(() => expect(receivedParams).not.toBeNull());
    expect(receivedParams?.get('code')).toBe('ab');
    expect(receivedParams?.get('geoLocationId')).toBe('11111111-1111-4111-8111-111111111111');
    expect(receivedParams?.get('reportDate')).toBe('2026-03-01');
  });

  it('con rol USER e includeInactive=true la petición va a /esavi-cases (no al admin)', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    let hitPlain = false;
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', () => {
        hitPlain = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/esavi-cases/admin', () =>
        HttpResponse.json({ ok: false, message: 'forbidden', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );

    renderPage('/esavi-cases?includeInactive=true');

    await waitFor(() => expect(hitPlain).toBe(true));
  });

  it('con rol ADMIN e includeInactive=true la petición va a /esavi-cases/admin', async () => {
    mockCurrentUser('ADMIN', 50);
    mockGeoLocationPicker();
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/admin', () => {
        hitAdmin = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage('/esavi-cases?includeInactive=true');

    await waitFor(() => expect(hitAdmin).toBe(true));
  });
});

describe('EsaviCaseListPage — estados vacíos', () => {
  it('el vacío sin filtros muestra la frase del alcance geográfico', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage('/esavi-cases');

    expect(await screen.findByText(/tu cobertura geográfica no esté asignada/)).toBeInTheDocument();
  });

  it('el vacío con filtros muestra el botón de limpiar filtros', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage('/esavi-cases?code=ab');

    expect(await screen.findByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });
});

describe('EsaviCaseListPage — fila inactiva', () => {
  it('una fila inactiva muestra el badge de inactivo', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [esaviCaseRow({ isActive: false })] },
        }),
      ),
    );

    renderPage('/esavi-cases');

    const badges = await screen.findAllByText('Inactivo');
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe('EsaviCaseListPage — pestañas', () => {
  it('cambiar de pestaña reemplaza la entrada del historial', async () => {
    mockCurrentUser('USER', 25);
    mockGeoLocationPicker();
    server.use(
      http.get('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    const user = setupUser();

    const router = renderPage('/esavi-cases');

    await user.click(await screen.findByRole('tab', { name: 'Bandeja por estado' }));

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('tab')).toBe('workflow');
    });

    router.navigate(-1);

    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
  });
});
