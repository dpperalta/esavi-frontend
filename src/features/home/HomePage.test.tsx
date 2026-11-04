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
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { batchAlertsFixture } from '@/features/dashboard/batchAlertsFixture';
import { distributionsFixture } from '@/features/dashboard/distributionsFixture';
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
  // indicators, the batch alerts (FE37), the epidemic curve (FE36a), the distributions (FE36b)
  // and, by level, the coverage or the geo tree. These defaults keep the FE34 tests about their own block; each test can
  // still override them.
  server.use(
    http.get(`${API}/dashboard/indicators`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() }),
    ),
    http.get(`${API}/dashboard/epi-curve`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: epiCurveFixture() }),
    ),
    http.get(`${API}/dashboard/distributions`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: distributionsFixture() }),
    ),
    http.get(`${API}/dashboard/batch-alerts`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: batchAlertsFixture() }),
    ),
    http.get(`${API}/user-geo-locations/user/:id/coverage`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { assigned: [], coverage: [], count: 0 },
      }),
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
        data: {
          userId: '1',
          displayName: 'Ana',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
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
        HttpResponse.json(
          { ok: false, message: 'Internal', code: 'DASH_006_FAILED' },
          { status: 500 },
        ),
      ),
    );

    renderHomeWithRouter();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar el trabajo pendiente.',
    );
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
    expect(
      await screen.findByRole('group', { name: /^Casos del periodo: 42/ }),
    ).toBeInTheDocument();
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
    expect(
      greeting.compareDocumentPosition(pendingWork) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pendingWork.compareDocumentPosition(surveillance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
              {
                ok: false,
                message: 'Periodo inválido',
                code: 'DASH_007_VALIDATION_ERROR',
                errors: [],
              },
              { status: 400 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );

    renderHome('/?from=2026-10-01&to=2026-10-31&keep=1');

    expect(await screen.findByRole('status')).toHaveTextContent(/no es válido/);
    expect(
      await screen.findByRole('group', { name: /^Casos del periodo: 42/ }),
    ).toBeInTheDocument();
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los indicadores.',
    );
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

  // Since FE36b the section also asks for /distributions; that request is asserted in its own
  // describe below, so this set only stops listing it as unexpected.
  it('con ANALYTICS pide /indicators y /epi-curve con la misma query, y nada más que /users/me, /distributions y /batch-alerts', async () => {
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
    await waitFor(() =>
      expect(new Set(requests.map(({ path }) => path))).toEqual(
        new Set([
          '/api/users/me',
          '/api/dashboard/indicators',
          '/api/dashboard/epi-curve',
          '/api/dashboard/distributions',
          '/api/dashboard/batch-alerts',
        ]),
      ),
    );
  });

  it('cambiar el atajo de periodo vuelve a pedir las dos con la misma query y conserva epiView', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const user = setupUser();
    renderHome('/?range=30d&epiView=table');
    // Scoped to the curve: since FE36c the geographic block adds a second table to Inicio.
    await within(
      await screen.findByRole('region', { name: 'Curva epidemiológica' }),
    ).findByRole('table');
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

describe('HomePage — distribuciones (SPEC FE36b)', () => {
  function recordRequests() {
    const requests: { path: string; search: string }[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, search: url.search });
    });
    return requests;
  }

  afterEach(() => server.events.removeAllListeners());

  it('con ANALYTICS pide /indicators, /epi-curve y /distributions una vez cada una, con la misma query', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requests = recordRequests();

    renderHome(
      '/?from=2026-10-01&to=2026-10-31&geoLocationId=3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40',
    );

    expect(await screen.findByRole('region', { name: 'Vacunas sospechosas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sexo y edad' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Fallos programáticos' })).toBeInTheDocument();
    const searches = ['/indicators', '/epi-curve', '/distributions'].map((endpoint) =>
      requests.filter(({ path }) => path.endsWith(endpoint)).map(({ search }) => search),
    );
    expect(searches.map((list) => list.length)).toEqual([1, 1, 1]);
    expect(new Set(searches.flat()).size).toBe(1);
  });

  it('cambiar de periodo conserva epiView, vaccinesView y sexAgeView', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const user = setupUser();
    renderHome('/?range=30d&epiView=table&vaccinesView=table&sexAgeView=table');
    await screen.findByRole('region', { name: 'Vacunas sospechosas' });

    await user.click(screen.getByRole('radio', { name: '90 días' }));

    const search = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(search.get('range')).toBe('90d');
    expect(search.get('epiView')).toBe('table');
    expect(search.get('vaccinesView')).toBe('table');
    expect(search.get('sexAgeView')).toBe('table');
  });

  it('un 500 de ESAVI-DASH-009 muestra un solo error y un solo «Reintentar», y deja visibles indicadores, curva y barra', async () => {
    mockCurrentUser('ANALYTICS', 10);
    server.use(
      http.get(`${API}/dashboard/distributions`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_009_DISTRIBUTIONS_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderHome();

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(
      'No pudimos cargar las distribuciones de vacunas, sexo y edad y fallos programáticos.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Vacunas sospechosas' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Curva epidemiológica' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Periodo' })).toBeInTheDocument();
  });
});

describe('HomePage — distribución geográfica (SPEC FE36c)', () => {
  const PICHINCHA = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';
  const QUITO = '7d3b9f1a-4c2e-4a6b-8e5d-2f1a0b9c8d7e';

  function recordRequests() {
    const requests: { path: string; search: string }[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, search: url.search });
    });
    return requests;
  }

  afterEach(() => server.events.removeAllListeners());

  // One level below Pichincha answers with its own child, so «back» can be told apart by its data.
  function mockLevels() {
    server.use(
      http.get(`${API}/dashboard/distributions`, ({ request }) => {
        const geoLocationId = new URL(request.url).searchParams.get('geoLocationId');
        const fixture = distributionsFixture();
        const data =
          geoLocationId === PICHINCHA
            ? distributionsFixture({
                scope: { ...fixture.scope, geoLocationId: PICHINCHA },
                geography: {
                  rows: [
                    {
                      geoLocationId: QUITO,
                      kind: 'unit',
                      name: 'Quito',
                      latitude: -0.22,
                      longitude: -78.51,
                      total: 18,
                      serious: 4,
                    },
                  ],
                },
              })
            : fixture;
        return HttpResponse.json({ ok: true, message: 'ok', data });
      }),
    );
  }

  function BackProbe() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => void navigate(-1)}>
        history-back
      </button>
    );
  }

  function renderHomeWithBack(path = '/') {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <HomePage />
            <LocationProbe />
            <BackProbe />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  }

  it('con ANALYTICS dibuja el bloque con la misma y única petición a /distributions', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requests = recordRequests();

    renderHome('/?range=30d');

    const block = await screen.findByRole('region', { name: 'Distribución geográfica' });
    expect(within(block).getByRole('button', { name: 'Ver Pichincha' })).toBeInTheDocument();
    expect(requests.filter(({ path }) => path.endsWith('/distributions'))).toHaveLength(1);
    expect(new Set(requests.map(({ path }) => path))).toEqual(
      new Set([
        '/api/users/me',
        '/api/dashboard/indicators',
        '/api/dashboard/epi-curve',
        '/api/dashboard/distributions',
        '/api/dashboard/batch-alerts',
      ]),
    );
  });

  it('con ANALYTICS, pulsar una unidad vuelve a pedir todo Inicio con ese geoLocationId y «atrás» sube un nivel', async () => {
    mockCurrentUser('ANALYTICS', 10);
    mockLevels();
    const user = setupUser();
    renderHomeWithBack('/?range=90d&vaccinesView=table');
    const block = await screen.findByRole('region', { name: 'Distribución geográfica' });
    expect(screen.getByText('Todo su territorio')).toBeInTheDocument();
    const requests = recordRequests();

    await user.click(within(block).getByRole('button', { name: 'Ver Pichincha' }));

    expect(
      await within(block).findByRole('button', { name: 'Ver Quito' }),
    ).toBeInTheDocument();
    for (const endpoint of ['/indicators', '/epi-curve', '/distributions']) {
      const sent = requests.filter(({ path }) => path.endsWith(endpoint));
      expect(sent).toHaveLength(1);
      expect(new URLSearchParams(sent[0].search).get('geoLocationId')).toBe(PICHINCHA);
    }
    expect(screen.getByText('Unidad seleccionada')).toBeInTheDocument();
    const search = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(search.get('range')).toBe('90d');
    expect(search.get('vaccinesView')).toBe('table');

    await user.click(screen.getByRole('button', { name: 'history-back' }));

    expect(
      await within(block).findByRole('button', { name: 'Ver Pichincha' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('search')).not.toHaveTextContent('geoLocationId');
    expect(screen.getByText('Todo su territorio')).toBeInTheDocument();
  });

  it('un 500 de /distributions muestra solo el error común del FE36b, sin error propio del bloque', async () => {
    mockCurrentUser('ANALYTICS', 10);
    server.use(
      http.get(`${API}/dashboard/distributions`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_009_DISTRIBUTIONS_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderHome();

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(
      screen.queryByRole('region', { name: 'Distribución geográfica' }),
    ).not.toBeInTheDocument();
  });
});

describe('HomePage — alertas por lote (SPEC FE37)', () => {
  function recordRequests() {
    const requests: { path: string; search: string }[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, search: url.search });
    });
    return requests;
  }

  afterEach(() => server.events.removeAllListeners());

  it('con ANALYTICS hace cuatro peticiones con la misma query y ninguna a /esavi-cases', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const requests = recordRequests();

    renderHome(
      '/?from=2026-10-01&to=2026-10-31&geoLocationId=3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40',
    );

    const block = await screen.findByRole('region', { name: 'Lotes con alerta en su territorio' });
    expect(await within(block).findAllByRole('article')).toHaveLength(3);
    await screen.findByRole('region', { name: 'Vacunas sospechosas' });
    const searches = ['/indicators', '/batch-alerts', '/epi-curve', '/distributions'].map(
      (endpoint) =>
        requests.filter(({ path }) => path.endsWith(endpoint)).map(({ search }) => search),
    );
    expect(searches.map((list) => list.length)).toEqual([1, 1, 1, 1]);
    expect(new Set(searches.flat()).size).toBe(1);
    expect(requests.some(({ path }) => path.includes('/esavi-cases'))).toBe(false);
    expect(within(block).queryByRole('link')).not.toBeInTheDocument();
  });

  it('el bloque está entre los indicadores y la curva', async () => {
    mockCurrentUser('ANALYTICS', 10);

    renderHome();

    const block = await screen.findByRole('region', { name: 'Lotes con alerta en su territorio' });
    const curve = await screen.findByRole('region', { name: 'Curva epidemiológica' });
    const indicators = screen.getByRole('group', { name: /^Casos del periodo: 42/ });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(indicators, block)).toBe(true);
    expect(follows(block, curve)).toBe(true);
  });

  it('con USER cada alerta enlaza a sus casos con el periodo de la respuesta', async () => {
    mockCurrentUser('USER', 20);
    server.use(
      http.get(`${API}/dashboard/pending-work`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );

    renderHome();

    const block = await screen.findByRole('region', { name: 'Lotes con alerta en su territorio' });
    const links = await within(block).findAllByRole('link', { name: 'Ver casos' });
    expect(links).toHaveLength(3);
    const { period } = batchAlertsFixture();
    const params = new URL(links[0].getAttribute('href') ?? '', 'http://localhost').searchParams;
    expect(params.get('reportDateFrom')).toBe(period.from);
    expect(params.get('reportDateTo')).toBe(period.to);
  });

  it('un 500 de ESAVI-DASH-010 muestra el error del bloque y deja visibles indicadores, curva y barra', async () => {
    mockCurrentUser('ANALYTICS', 10);
    server.use(
      http.get(`${API}/dashboard/batch-alerts`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_010_BATCH_ALERTS_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderHome();

    const block = await screen.findByRole('region', { name: 'Lotes con alerta en su territorio' });
    expect(await within(block).findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las alertas por lote.',
    );
    expect(within(block).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Curva epidemiológica' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Periodo' })).toBeInTheDocument();
  });
});
