import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardPage } from './CaseWizardPage';

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

const caseDetail = {
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
  healthFacility: { healthFacilityId: 'facility-1', localCode: 'HF-01', name: 'Centro Norte' },
};

function mockCase() {
  server.use(
    http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: caseDetail }),
    ),
  );
}

function mockWorkflowError(code: string) {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({ ok: false, message: 'error del backend', code }, { status: 404 }),
    ),
  );
}

function mockWorkflow(
  statusCode: string,
  stages: Record<string, { exists: boolean; endedAt: string | null }>,
) {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: statusCode, name: statusCode },
          previousStatus: null,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: Object.fromEntries(
            Object.entries(stages).map(([key, value]) => [
              key,
              {
                id: value.exists ? `${key}-1` : null,
                startedAt: null,
                durationMinutes: null,
                ...value,
              },
            ]),
          ),
        },
      }),
    ),
  );
}

function renderPage(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/esavi-cases/:id/wizard/:step?" element={<CaseWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseWizardPage — reanudación y bloqueo de paso', () => {
  it('navegar a un :step bloqueado a mano redirige al último paso desbloqueado', async () => {
    mockCase();
    mockWorkflow('OPEN', {
      classification: { exists: false, endedAt: null },
      notification: { exists: false, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    const { container } = renderPage('/esavi-cases/case-1/wizard/investigation');

    // investigation depends on notification.exists === true, still false — bounces to
    // classification, the only step unlocked with nothing started yet.
    await waitFor(() => expect(container.querySelector('a[aria-current="step"]')).toBeNull());
    await waitFor(() => expect(screen.getByText('classification')).toBeInTheDocument());
  });

  it('/wizard sin :step reanuda en el paso que corresponde según stages', async () => {
    mockCase();
    mockWorkflow('OPEN', {
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: false, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    renderPage('/esavi-cases/case-1/wizard');

    // classification is done; notification is unlocked (classification.exists === true) and
    // is the most advanced unlocked step — investigation/final-classification stay locked
    // (their precondition, notification.exists, is still false).
    await waitFor(() => expect(screen.getByText('notification')).toBeInTheDocument());
  });
});

describe('CaseWizardPage — reentrada de patient y case-opening (SPEC FE10 §13)', () => {
  it('/wizard/patient abre la identidad de sólo lectura con «Editar paciente», sin ofrecer cambiar de paciente', async () => {
    mockCase();
    mockWorkflow('OPEN', {
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: false, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            patientId: 'patient-1',
            names: 'Ana',
            lastNames: 'Perez',
            documentNumber: '0102030405',
            passportNumber: null,
            birthDate: null,
            healthSystemCode: null,
            email: null,
            phoneNumber: null,
            isActive: true,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            sex: null,
            residence: null,
          },
        }),
      ),
    );

    renderPage('/esavi-cases/case-1/wizard/patient');

    expect(await screen.findByText('Ana Perez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar paciente' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Término de búsqueda')).not.toBeInTheDocument();
    // patient no tiene stage: sin la barra genérica de Guardar/Completar etapa.
    expect(screen.queryByRole('button', { name: 'Completar etapa' })).not.toBeInTheDocument();
  });
});

describe('CaseWizardPage — CLOSED', () => {
  it('con CLOSED se renderiza el banner de sólo lectura y se ocultan Guardar y Completar etapa', async () => {
    mockCase();
    mockWorkflow('CLOSED', {
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: true, endedAt: '2026-09-02' },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    renderPage('/esavi-cases/case-1/wizard/classification');

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Completar etapa' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
  });
});

describe('CaseWizardPage — las dos pantallas de error de 006', () => {
  it('CASEFLOW_006_CASE_NOT_FOUND muestra la pantalla dedicada de caso inexistente', async () => {
    mockCase();
    mockWorkflowError('CASEFLOW_006_CASE_NOT_FOUND');

    renderPage('/esavi-cases/case-1/wizard/classification');

    await waitFor(() => expect(screen.getByText('Este caso no existe')).toBeInTheDocument());
    expect(screen.queryByText('Este caso no tiene expediente de flujo')).not.toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar el expediente')).not.toBeInTheDocument();
  });

  it('CASEFLOW_006_NOT_FOUND muestra la pantalla dedicada de flujo faltante, distinta', async () => {
    mockCase();
    mockWorkflowError('CASEFLOW_006_NOT_FOUND');

    renderPage('/esavi-cases/case-1/wizard/classification');

    await waitFor(() =>
      expect(screen.getByText('Este caso no tiene expediente de flujo')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Este caso no existe')).not.toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar el expediente')).not.toBeInTheDocument();
    // Names the case via the independent 003 read, per SPEC FE08 §3.6.
    await waitFor(() => expect(screen.getByText(/ESAVI-2026-000001/)).toBeInTheDocument());
  });

  it('un code que no es de las dos pantallas dedicadas cae al error genérico', async () => {
    mockCase();
    mockWorkflowError('CASEFLOW_006_UNKNOWN');

    renderPage('/esavi-cases/case-1/wizard/classification');

    await waitFor(() =>
      expect(screen.getByText('No pudimos cargar el expediente')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
