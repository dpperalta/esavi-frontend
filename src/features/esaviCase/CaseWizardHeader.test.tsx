import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
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
      <CaseWizardHeader caseId="case-1" />
    </QueryClientProvider>,
  );
}

describe('CaseWizardHeader', () => {
  it('muestra el código de caso, el paciente, la unidad de salud y el estado del workflow', async () => {
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

    renderHeader();

    await waitFor(() => expect(screen.getByText('ESAVI-2026-000001')).toBeInTheDocument());
    expect(screen.getByText(/Ana Perez/)).toBeInTheDocument();
    expect(screen.getByText(/Centro Norte/)).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
  });
});
