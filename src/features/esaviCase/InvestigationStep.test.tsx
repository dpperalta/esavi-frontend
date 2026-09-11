import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { CaseWizardProvider } from './CaseWizardContext';
import { InvestigationStep } from './InvestigationStep';

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function mockWorkflow(investigationExists: boolean) {
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: CASE_1,
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
            notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
            investigation: {
              exists: investigationExists,
              id: investigationExists ? INVESTIGATION_1 : null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
          },
          totalDurationMinutes: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
  );
}

const investigationDetail = {
  investigationId: INVESTIGATION_1,
  case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01', eventDate: '2026-01-15' },
  status: null,
  vaccinationSite: null,
  vaccinationHealthFacility: null,
  vaccinationGeoLocation: null,
  hospitalizationDate: null,
  investigationStartDate: null,
  vaccinationLatitude: null,
  vaccinationLongitude: null,
  notes: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

function mockInvestigationDetail() {
  server.use(
    http.get(`http://localhost:4500/api/investigations/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail }),
    ),
  );
}

function renderInvestigationStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/esavi-cases/${CASE_1}/wizard/investigation`]}>
        <CaseWizardProvider>
          <InvestigationStep caseId={CASE_1} />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvestigationStep — vacío pero vivo (SPEC FE13a §4 paso 6)', () => {
  it('entrar en un caso sin investigación dispara un solo POST', async () => {
    mockWorkflow(false);
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigations', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail });
      }),
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            caseWorkflowId: 'workflow-1',
            caseId: CASE_1,
            status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
            previousStatus: null,
            openedAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            lastReopenedAt: null,
            reopenCount: 0,
            stages: {
              classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
              notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
              investigation: { exists: postCount > 0, id: postCount > 0 ? INVESTIGATION_1 : null, startedAt: null, endedAt: null, durationMinutes: null },
              finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            },
            totalDurationMinutes: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
          },
        }),
      ),
    );

    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ caseId: CASE_1 });

    // Se mantiene en 1 aunque el workflow se refresque y confirme `exists:true` (la invalidación
    // que dispara el propio `POST` al tener éxito).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(postCount).toBe(1);
  });

  it('entrar en un caso que ya tiene investigación no dispara ningún POST', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail });
      }),
    );

    renderInvestigationStep();

    await waitFor(() => expect(server).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(postCount).toBe(0);
  });

  it('con el POST en error, no se pinta ningún formulario y hay botón de reintentar', async () => {
    mockWorkflow(false);
    server.use(
      http.post('http://localhost:4500/api/investigations', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya existe', code: 'INVESTGN_001_ALREADY_INVESTIGATED' },
          { status: 409 },
        ),
      ),
    );

    renderInvestigationStep();

    await waitFor(() =>
      expect(screen.getByText('No se pudo iniciar la investigación.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el botón de reintentar vuelve a intentar el POST', async () => {
    mockWorkflow(false);
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        if (postCount === 1) {
          return HttpResponse.json(
            { ok: false, message: 'error', code: 'UNKNOWN_ERROR' },
            { status: 500 },
          );
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail });
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() =>
      expect(screen.getByText('No se pudo iniciar la investigación.')).toBeInTheDocument(),
    );
    expect(postCount).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(postCount).toBe(2));
  });
});
