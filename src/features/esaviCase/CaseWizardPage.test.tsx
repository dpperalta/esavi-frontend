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
    expect(screen.queryByText('caseWizard.actions.save')).not.toBeInTheDocument();
    expect(screen.queryByText('caseWizard.actions.completeStage')).not.toBeInTheDocument();
    expect(screen.getByText('caseWizard.actions.next')).toBeInTheDocument();
  });
});
