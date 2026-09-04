import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EsaviApiError } from '@/shared/api/types';
import { CaseWorkflowErrorScreen } from './CaseWorkflowErrorScreen';

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

function renderScreen(error: EsaviApiError) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseWorkflowErrorScreen error={error} caseId="case-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseWorkflowErrorScreen', () => {
  it('CASEFLOW_006_CASE_NOT_FOUND renderiza la pantalla dedicada de caso inexistente, no la genérica', () => {
    renderScreen(new EsaviApiError('not found', 404, 'CASEFLOW_006_CASE_NOT_FOUND'));

    expect(screen.getByText('Este caso no existe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al listado' })).toBeInTheDocument();
    expect(screen.queryByText('Este caso no tiene expediente de flujo')).not.toBeInTheDocument();
  });

  it('CASEFLOW_006_NOT_FOUND renderiza la pantalla dedicada de flujo faltante, distinta de la de caso inexistente', async () => {
    server.use(
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
    );

    renderScreen(new EsaviApiError('not found', 404, 'CASEFLOW_006_NOT_FOUND'));

    expect(screen.getByText('Este caso no tiene expediente de flujo')).toBeInTheDocument();
    expect(screen.queryByText('Este caso no existe')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/ESAVI-2026-000001/)).toBeInTheDocument());
  });

  it('cualquier otro code no renderiza ninguna de las dos pantallas dedicadas', () => {
    renderScreen(new EsaviApiError('boom', 500, 'CASEFLOW_006_UNKNOWN'));

    expect(screen.queryByText('Este caso no existe')).not.toBeInTheDocument();
    expect(screen.queryByText('Este caso no tiene expediente de flujo')).not.toBeInTheDocument();
  });
});
