import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CaseWizardPage } from '@/features/esaviCase/CaseWizardPage';
import { NewCasePage } from '@/features/esaviCase/NewCasePage';
import { HomePage } from '@/features/home/HomePage';
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
                <Route path="/esavi-cases/new" element={<NewCasePage />} />
                <Route path="/esavi-cases/:id/wizard/:step?" element={<CaseWizardPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
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
  it('/esavi-cases/new resuelve', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/new');

    expect(
      await screen.findByRole('heading', { name: 'Nuevo expediente ESAVI' }),
    ).toBeInTheDocument();
  });

  it('/esavi-cases/:id/wizard/classification resuelve', async () => {
    signInAs('USER', 25);

    renderApp('/esavi-cases/case-1/wizard/classification');

    await waitFor(() => expect(screen.getByText('ESAVI-2026-000001')).toBeInTheDocument());
  });
});
