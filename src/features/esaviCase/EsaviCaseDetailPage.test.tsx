import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EsaviCaseDetailPage } from './EsaviCaseDetailPage';

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

function caseDetail(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case-1',
    caseCode: 'ESAVI-0001',
    reportDate: '2026-03-01',
    eventDate: '2026-02-20',
    countryIsoCode: 'EC',
    reportFillingDate: '2026-03-02',
    notificationOrganization: null,
    details: null,
    isActive: true,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    patient: {
      patientId: 'patient-1',
      names: 'Ana',
      lastNames: 'Pérez',
      documentNumber: '0102030405',
      healthSystemCode: null,
    },
    healthFacility: {
      healthFacilityId: 'hfac-1',
      localCode: 'HF-1',
      name: 'Hospital Central',
    },
    ...overrides,
  };
}

function workflowDetail(overrides: Record<string, unknown> = {}) {
  const stage = { exists: true, id: 's-1', startedAt: '2026-01-01', endedAt: '2026-01-02', durationMinutes: 60 };
  return {
    caseWorkflowId: 'wf-1',
    caseId: 'case-1',
    caseCode: 'ESAVI-0001',
    status: { catalogItemId: 'item-open', code: 'OPEN', name: 'Abierto' },
    previousStatus: null,
    openedAt: '2026-01-01T10:00:00.000Z',
    closedAt: null,
    lastReopenedAt: null,
    reopenCount: 0,
    stages: { classification: stage, notification: stage, investigation: stage, finalClassification: stage },
    totalDurationMinutes: null,
    isActive: true,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(id = 'case-1') {
  const router = createMemoryRouter(
    [{ path: '/esavi-cases/:id', element: <EsaviCaseDetailPage /> }],
    { initialEntries: [`/esavi-cases/${id}`] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('EsaviCaseDetailPage — 404 del 003', () => {
  it('muestra la pantalla neutra y no el estado de error genérico', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: false, message: 'not found', code: 'CASE_003_NOT_FOUND' }, { status: 404 }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText('Este caso no existe o está fuera de tu alcance.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar los datos.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al listado' })).toBeInTheDocument();
  });
});

describe('EsaviCaseDetailPage — bloque de estado del 006', () => {
  it('«Abrir expediente» está deshabilitado mientras el 006 carga', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseDetail() }),
      ),
      http.get('http://localhost:4500/api/case-workflows/case/case-1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ ok: true, message: 'ok', data: workflowDetail() });
      }),
    );

    renderPage();

    await screen.findByText('ESAVI-0001');
    expect(screen.queryByRole('button', { name: /Abrir expediente|sólo lectura/ })).not.toBeInTheDocument();
  });

  it('se habilita igual si el 006 falla, sin etiqueta de estado', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseDetail() }),
      ),
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'not found', code: 'CASEFLOW_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    renderPage();

    const button = await screen.findByRole('button', { name: 'Abrir expediente' });
    expect(button).toBeEnabled();
  });

  it('con CLOSED el botón dice «Ver expediente (sólo lectura)»', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseDetail() }),
      ),
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: workflowDetail({ status: { catalogItemId: 'item-closed', code: 'CLOSED', name: 'Cerrado' } }),
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Ver expediente (sólo lectura)' }),
    ).toBeInTheDocument();
  });
});

describe('EsaviCaseDetailPage — auditoría', () => {
  it('un USER no ve <AuditTrail>', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseDetail() }),
      ),
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowDetail() }),
      ),
    );

    renderPage();

    await screen.findByText('ESAVI-0001');
    expect(screen.queryByText('Historial de auditoría')).not.toBeInTheDocument();
  });

  it('un SUPERADMIN sí ve <AuditTrail>', async () => {
    mockCurrentUser('SUPERADMIN', 100);
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseDetail() }),
      ),
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowDetail() }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Historial de auditoría')).toBeInTheDocument());
  });
});
