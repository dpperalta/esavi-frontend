import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardHeader } from './CaseWizardHeader';

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

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseWizardHeader caseId="case-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type CatalogRef = { catalogItemId: string; code: string; name: string };

const emptyStage = {
  exists: false,
  id: null,
  startedAt: null,
  endedAt: null,
  durationMinutes: null,
};

function mockReads(status: CatalogRef, previousStatus: CatalogRef | null = null) {
  server.use(
    http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseId: 'case-1',
          caseCode: 'ESAVI-2026-000001',
          reportDate: '2026-09-01',
          eventDate: '2026-08-30',
          countryIsoCode: 'EC',
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
          status,
          previousStatus,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: emptyStage,
            notification: emptyStage,
            investigation: emptyStage,
            finalClassification: emptyStage,
          },
        },
      }),
    ),
  );
}

const OPEN = { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' };
const IN_NOTIFICATION = {
  catalogItemId: 'status-3',
  code: 'IN_NOTIFICATION',
  name: 'En notificación',
};
const PENDING_VALIDATION = {
  catalogItemId: 'status-7',
  code: 'PENDING_VALIDATION',
  name: 'Pendiente de validación',
};

describe('CaseWizardHeader', () => {
  it('muestra el código de caso, el paciente, la unidad de salud y el estado del workflow', async () => {
    mockReads(OPEN);
    renderHeader();

    await waitFor(() => expect(screen.getByText('ESAVI-2026-000001')).toBeInTheDocument());
    expect(screen.getByText(/Ana Perez/)).toBeInTheDocument();
    expect(screen.getByText(/Centro Norte/)).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al listado' })).toBeInTheDocument();
  });

  // SPEC FE23 §4 paso 3
  it('con un estado abierto ofrece «Pedir validación»', async () => {
    mockReads(OPEN);
    renderHeader();

    expect(await screen.findByRole('button', { name: 'Pedir validación' })).toBeInTheDocument();
  });

  it('en revisión, el badge nombra el estado anterior y ofrece «Resolver validación»', async () => {
    mockReads(PENDING_VALIDATION, IN_NOTIFICATION);
    renderHeader();

    expect(
      await screen.findByText('Pendiente de validación · venía de En notificación'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolver validación' })).toBeInTheDocument();
  });

  it('con previousStatus null, el badge muestra sólo el nombre del estado', async () => {
    mockReads(PENDING_VALIDATION, null);
    renderHeader();

    expect(await screen.findByText('Pendiente de validación')).toBeInTheDocument();
    expect(screen.queryByText(/venía de/)).toBeNull();
  });
});
