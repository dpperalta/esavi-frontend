import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CaseOpeningStep } from '@/features/esaviCase/CaseOpeningStep';
import { CaseWizardPage } from '@/features/esaviCase/CaseWizardPage';
import { EsaviCaseDetailPage } from '@/features/esaviCase/EsaviCaseDetailPage';
import { EsaviCaseListPage } from '@/features/esaviCase/EsaviCaseListPage';
import { HomePage } from '@/features/home/HomePage';
import { PatientStep } from '@/features/patient/PatientStep';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';

const server = setupServer();

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
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          displayName: 'Persona de prueba',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
    http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseId: 'case-1',
          caseCode: 'ESAVI-2026-000001',
          reportDate: null,
          eventDate: null,
          countryIsoCode: null,
          reportFillingDate: null,
          notificationOrganization: null,
          details: null,
          isActive: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          patient: {
            patientId: 'patient-1',
            names: 'Ana',
            lastNames: 'Perez',
            documentNumber: '0102030405',
            healthSystemCode: null,
          },
          healthFacility: {
            healthFacilityId: 'facility-1',
            localCode: 'HF-01',
            name: 'Centro Norte',
          },
        },
      }),
    ),
    http.get('http://localhost:4500/api/esavi-cases', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/geo-locations', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            notification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            investigation: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            finalClassification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
          },
        },
      }),
    ),
  );
}

// Mirrors the real nesting of app/router.tsx: RequireAuth → RequireRole(USER) → the two routes.
function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>login-screen</div>} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
                <Route path="/esavi-cases" element={<EsaviCaseListPage />} />
                {/* SPEC FE09 §3.1 / SPEC FE10 §3.1: /esavi-cases/new/... declared before
                    /esavi-cases/:id, mirroring app/router.tsx exactly — this is the test that
                    pins the order down. */}
                <Route path="/esavi-cases/new" element={<PatientStep />} />
                <Route path="/esavi-cases/new/patient" element={<PatientStep />} />
                <Route path="/esavi-cases/new/case-opening" element={<CaseOpeningStep />} />
                <Route path="/esavi-cases/new/:step" element={<PatientStep />} />
                <Route path="/esavi-cases/:id" element={<EsaviCaseDetailPage />} />
                <Route path="/esavi-cases/:id/wizard/:step?" element={<CaseWizardPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// Same route tree as `renderApp`, but via `createMemoryRouter` so the resulting location is
// inspectable — needed only to prove a bad `:step` resolves in place, with no `Navigate`.
function renderAppWithRouter(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/login', element: <div>login-screen</div> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            element: <RequireRole level={ROLE_LEVELS.USER} />,
            children: [
              { path: '/esavi-cases', element: <EsaviCaseListPage /> },
              { path: '/esavi-cases/new', element: <PatientStep /> },
              { path: '/esavi-cases/new/patient', element: <PatientStep /> },
              { path: '/esavi-cases/new/case-opening', element: <CaseOpeningStep /> },
              { path: '/esavi-cases/new/:step', element: <PatientStep /> },
              { path: '/esavi-cases/:id', element: <EsaviCaseDetailPage /> },
              { path: '/esavi-cases/:id/wizard/:step?', element: <CaseWizardPage /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('Rutas /esavi-cases/new y /esavi-cases/:id/wizard/:step — sin sesión', () => {
  it('/esavi-cases/new sin sesión redirige a /login', async () => {
    renderApp('/esavi-cases/new');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });

  it('/esavi-cases/:id/wizard/classification sin sesión redirige a /login', async () => {
    renderApp('/esavi-cases/case-1/wizard/classification');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });
});

describe('Rutas /esavi-cases/new y /esavi-cases/:id/wizard/:step — con USER autenticado', () => {
  it('/esavi-cases/new resuelve el paso 1 sin :step', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/new');

    expect(
      await screen.findByRole('radiogroup', { name: 'Modo de búsqueda de paciente' }),
    ).toBeInTheDocument();
  });

  it('/esavi-cases/:id/wizard/classification resuelve', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/case-1/wizard/classification');

    await waitFor(() => expect(screen.getByText('ESAVI-2026-000001')).toBeInTheDocument());
  });

  // SPEC FE09 §3.1, §5 / SPEC FE10 §3.1: el orden de las rutas importa — /new compite por el
  // mismo segmento que /:id. Si /esavi-cases/:id se declarara antes, "new" resolvería como un
  // caseId y esta pantalla sería el detalle, no el paso 1 del alta.
  it('/esavi-cases/new abre PatientStep y no EsaviCaseDetailPage con id="new"', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/new');

    expect(
      await screen.findByRole('radiogroup', { name: 'Modo de búsqueda de paciente' }),
    ).toBeInTheDocument();
    // El detalle pintaría "Volver al listado" y el bloque de estado del expediente; ninguno de
    // los dos aparece si la ruta resolvió correctamente al paso 1 del alta.
    expect(screen.queryByText('Volver al listado')).not.toBeInTheDocument();
  });

  it('/esavi-cases/new/case-opening abre CaseOpeningStep', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/user-geo-locations/user/1/coverage', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { assigned: [{ geoLocationId: 'g1', name: 'Pichincha', level: 1 }], coverage: [], count: 1 },
        }),
      ),
      http.get('http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE', () =>
        HttpResponse.json({ ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' }, { status: 404 }),
      ),
    );

    renderApp('/esavi-cases/new/case-opening?patientId=patient-1');

    expect(await screen.findByRole('button', { name: 'Crear caso' })).toBeInTheDocument();
  });

  // SPEC FE10 §3.4, §14: un valor de :step desconocido se trata como `patient`, sin redirigir —
  // mismo criterio que el `?tab=` de FE09.
  it('/esavi-cases/new/basura se comporta como patient sin redirigir', async () => {
    signInAs('USER', 25);

    const router = renderAppWithRouter('/esavi-cases/new/basura');

    expect(
      await screen.findByRole('radiogroup', { name: 'Modo de búsqueda de paciente' }),
    ).toBeInTheDocument();
    // No hay Navigate de por medio: la ruta sigue siendo la que se pidió.
    expect(router.state.location.pathname).toBe('/esavi-cases/new/basura');
  });

  it('/esavi-cases/case-1 abre EsaviCaseDetailPage', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/case-1');

    await waitFor(() => expect(screen.getByText('ESAVI-2026-000001')).toBeInTheDocument());
    expect(screen.getByText('Volver al listado')).toBeInTheDocument();
  });
});

describe('Rutas /esavi-cases y /esavi-cases/:id — con ANALYTICS autenticado', () => {
  it('un ANALYTICS es redirigido a / si teclea /esavi-cases', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/esavi-cases');

    expect(await screen.findByText(/^Hola, /)).toBeInTheDocument();
    expect(screen.queryByText('Casos ESAVI')).not.toBeInTheDocument();
  });
});
