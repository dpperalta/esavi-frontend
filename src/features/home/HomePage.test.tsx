import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// Interpolated i18n text ("Hola, {{name}}") is asserted here, unlike other tests that check
// the raw key — real i18next needs to be initialized for the interpolation to happen at all.
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { epiCurveFixture } from '@/features/dashboard/epiCurveFixture';
import { indicatorsFixture } from '@/features/dashboard/indicatorsFixture';
import { pendingWorkFixture } from '@/features/dashboard/pendingWorkFixture';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { HomePage } from './HomePage';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

const API = 'http://localhost:4500/api';

beforeEach(() => {
  localStorage.clear();
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
  // Since SPEC FE35 every role from ANALYTICS up mounts «Vigilancia», which asks for the
  // indicators, the epidemic curve (FE36a) and, by level, the coverage or the geo tree. These
  // defaults keep the FE34 tests about their own block; each test can still override them.
  server.use(
    http.get(`${API}/dashboard/indicators`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() }),
    ),
    http.get(`${API}/dashboard/epi-curve`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: epiCurveFixture() }),
    ),
    http.get(`${API}/user-geo-locations/user/:id/coverage`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { assigned: [], coverage: [], count: 0 } }),
    ),
    http.get(`${API}/geo-level-types`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`${API}/geo-locations`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
});

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

// «Vigilancia» reads the period from the URL and its change badges use tooltips, so every render
// needs a router and a TooltipProvider.
function renderHome(path = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <HomePage />
          <LocationProbe />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const renderHomeWithRouter = renderHome;

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', displayName: 'Ana', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

describe('HomePage — bloque «Trabajo pendiente» (SPEC FE34)', () => {
  it('con ANALYTICS no monta «Trabajo pendiente» ni pide /dashboard/pending-work', async () => {
    mockCurrentUser('ANALYTICS', 10);
    // No handler for pending-work: `onUnhandledRequest: 'error'` would fail the request if made.
    let pendingWorkRequested = false;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/dashboard/pending-work')) pendingWorkRequested = true;
    });

    renderHomeWithRouter();

    expect(await screen.findByText('Hola, Ana')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Trabajo pendiente' })).not.toBeInTheDocument();
    expect(pendingWorkRequested).toBe(false);
    server.events.removeAllListeners();
  });

  it('con USER monta el bloque y pide /dashboard/pending-work', async () => {
    mockCurrentUser('USER', 20);
    let pendingWorkRequested = false;
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () => {
        pendingWorkRequested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );

    renderHomeWithRouter();

    expect(await screen.findByRole('list', { name: 'Casos por estado' })).toBeInTheDocument();
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(pendingWorkRequested).toBe(true);
  });

  it('un 500 del bloque deja el saludo visible', async () => {
    mockCurrentUser('USER', 20);
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: false, message: 'Internal', code: 'DASH_006_FAILED' }, { status: 500 }),
      ),
    );

    renderHomeWithRouter();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el trabajo pendiente.');
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
  });
});

describe('HomePage', () => {
  it('muestra el displayName y el rol de ESAVI-USER-007, no el del login', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: '1',
            // A propósito, distinto del nombre que traería una respuesta de login: si algo
            // en HomePage leyera esa fuente por error, este test lo delataría.
            displayName: 'Nombre de /users/me',
            roles: [
              { roleId: 'r1', name: 'USER', code: 'USER', level: 25 },
              { roleId: 'r2', name: 'ADMIN', code: 'ADMIN', level: 50 },
            ],
          },
        }),
      ),
    );

    renderHome();

    await waitFor(() => expect(screen.getByText('Hola, Nombre de /users/me')).toBeInTheDocument());
    // The role shown is the higher of the two (ADMIN), not the first in the list.
    expect(screen.getByText('Tu rol: ADMIN')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintentar cuando la query falla', async () => {
    const user = setupUser();
    let callCount = 0;
    server.use(
      http.get('http://localhost:4500/api/users/me', () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { ok: false, message: 'Error', code: 'USER_007_NOT_FOUND' },
            { status: 404 },
          );
        }
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', displayName: 'Recuperado', roles: [] },
        });
      }),
    );

    renderHome();

    await waitFor(() =>
      expect(
        screen.getByText('Ocurrió un error inesperado. Inténtalo de nuevo.'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.getByText('Hola, Recuperado')).toBeInTheDocument());
  });
});

describe('HomePage — sección «Vigilancia» (SPEC FE35)', () => {
  it('con ANALYTICS muestra el saludo y «Vigilancia», sin pedir /pending-work, /coverage ni /geo-locations', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(new URL(request.url).pathname);
    });

    renderHome();

    expect(await screen.findByRole('region', { name: 'Vigilancia' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(screen.getByText('Todo su territorio')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Trabajo pendiente' })).not.toBeInTheDocument();
    expect(requested.some((path) => /pending-work|coverage|geo-locations/.test(path))).toBe(false);
    server.events.removeAllListeners();
  });

  it('con ANALYTICS y ?geoLocationId la petición lo lleva, y la barra muestra «Unidad seleccionada»', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const geoLocationId = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';
    let received: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/dashboard/indicators`, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );

    renderHome(`/?geoLocationId=${geoLocationId}`);

    expect(await screen.findByText('Unidad seleccionada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver todo mi territorio' })).toBeInTheDocument();
    await waitFor(() => expect(received?.get('geoLocationId')).toBe(geoLocationId));
  });

  it('con USER el orden es saludo, «Trabajo pendiente» y «Vigilancia»', async () => {
    mockCurrentUser('USER', 20);
    server.use(
      http.get(`${API}/dashboard/pending-work`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );

    renderHome();

    const pendingWork = await screen.findByRole('region', { name: 'Trabajo pendiente' });
    const surveillance = await screen.findByRole('region', { name: 'Vigilancia' });
    const greeting = screen.getByText('Hola, Ana');
    expect(greeting.compareDocumentPosition(pendingWork) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pendingWork.compareDocumentPosition(surveillance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sin parámetros la petición va sin from, to ni geoLocationId, y la barra muestra data.period', async () => {
    mockCurrentUser('ANALYTICS', 10);
    let received: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/dashboard/indicators`, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );

    renderHome();

    expect(await screen.findByText(/^Del .*5.* al .*3.*2026$/)).toBeInTheDocument();
    expect(received?.has('from')).toBe(false);
    expect(received?.has('to')).toBe(false);
    expect(received?.has('geoLocationId')).toBe(false);
  });

  it('un 400 deja la URL sin periodo, muestra el aviso y vuelve a pedir sin parámetros', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/dashboard/indicators`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        return params.has('from')
          ? HttpResponse.json(
              { ok: false, message: 'Periodo inválido', code: 'DASH_007_VALIDATION_ERROR', errors: [] },
              { status: 400 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );

    renderHome('/?from=2026-10-01&to=2026-10-31&keep=1');

    expect(await screen.findByRole('status')).toHaveTextContent(/no es válido/);
    expect(await screen.findByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent(/^\?keep=1$/);
    expect(requests.at(-1)?.has('from')).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un 500 de ESAVI-DASH-007 deja visibles el saludo, «Trabajo pendiente» y la barra, con «Reintentar»', async () => {
    mockCurrentUser('USER', 20);
    server.use(
      http.get(`${API}/dashboard/pending-work`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
      http.get(`${API}/dashboard/indicators`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_007_INDICATORS_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los indicadores.');
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trabajo pendiente' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Periodo' })).toBeInTheDocument();
    const indicators = screen.getByRole('region', { name: 'Indicadores' });
    expect(indicators).toContainElement(screen.getByRole('button', { name: 'Reintentar' }));
  });
});

describe('HomePage — curva epidemiológica (SPEC FE36a)', () => {
  function recordRequests() {
    const requests: { path: string; search: string }[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, search: url.search });
    });
    return requests;
  }

  afterEach(() => server.events.removeAllListeners());

  it('con ANALYTICS pide /indicators y /epi-curve con la misma query, y nada más que /users/me', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requests = recordRequests();

    renderHome(
      '/?from=2026-10-01&to=2026-10-31&geoLocationId=3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40',
    );

    expect(await screen.findByRole('region', { name: 'Curva epidemiológica' })).toBeInTheDocument();
    await waitFor(() =>
      expect(requests.some(({ path }) => path.endsWith('/epi-curve'))).toBe(true),
    );
    const indicators = requests.find(({ path }) => path.endsWith('/indicators'));
    const epiCurve = requests.find(({ path }) => path.endsWith('/epi-curve'));
    expect(epiCurve?.search).toBe(indicators?.search);
    expect(new Set(requests.map(({ path }) => path))).toEqual(
      new Set(['/api/users/me', '/api/dashboard/indicators', '/api/dashboard/epi-curve']),
    );
  });

  it('cambiar el atajo de periodo vuelve a pedir las dos con la misma query y conserva epiView', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const user = setupUser();
    renderHome('/?range=30d&epiView=table');
    await screen.findByRole('table');
    const requests = recordRequests();

    await user.click(screen.getByRole('radio', { name: '90 días' }));

    await waitFor(() => {
      expect(requests.filter(({ path }) => path.endsWith('/indicators'))).toHaveLength(1);
      expect(requests.filter(({ path }) => path.endsWith('/epi-curve'))).toHaveLength(1);
    });
    const [indicators, epiCurve] = ['/indicators', '/epi-curve'].map(
      (endpoint) => requests.find(({ path }) => path.endsWith(endpoint))?.search,
    );
    expect(epiCurve).toBe(indicators);
    const search = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(search.get('range')).toBe('90d');
    expect(search.get('epiView')).toBe('table');
  });

  it('la suma de la curva coincide con «Casos del periodo» para la misma query', async () => {
    mockCurrentUser('ANALYTICS', 10);

    renderHome('/?epiView=table');

    const curve = await screen.findByRole('region', { name: 'Curva epidemiológica' });
    const totals = (await within(curve).findAllByRole('row'))
      .slice(1)
      .map((row) => Number(within(row).getAllByRole('cell').at(-1)?.textContent));
    const casesInPeriod = indicatorsFixture().volume.total.current;
    expect(totals.reduce((sum, total) => sum + total, 0)).toBe(casesInPeriod);
    expect(
      screen.getByRole('group', { name: new RegExp(`^Casos del periodo: ${casesInPeriod}`) }),
    ).toBeInTheDocument();
  });

  it('un 500 de ESAVI-DASH-008 muestra el error de la curva y deja visibles los indicadores y la barra', async () => {
    mockCurrentUser('ANALYTICS', 10);
    server.use(
      http.get(`${API}/dashboard/epi-curve`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_008_EPI_CURVE_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderHome();

    const curve = await screen.findByRole('region', { name: 'Curva epidemiológica' });
    expect(await within(curve).findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la curva epidemiológica.',
    );
    expect(within(curve).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Periodo' })).toBeInTheDocument();
  });
});
