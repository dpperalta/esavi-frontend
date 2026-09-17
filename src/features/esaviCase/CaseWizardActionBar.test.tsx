import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupUser } from '@/test/user';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
import type { CaseWizardStepSlug } from './steps';

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
  classificationCalls = 0;
  notificationCalls = 0;
});

function mockWorkflow(classificationExists: boolean) {
  server.use(
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
              exists: classificationExists,
              id: classificationExists ? 'c-1' : null,
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

function renderActionBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseWizardProvider>
          <CaseWizardActionBar caseId="case-1" activeSlug="classification" />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// SPEC FE14b §4 paso 8 — «Siguiente» sobre el paso no requerido.
function mockFullWorkflow(stages: Record<string, { exists: boolean; endedAt: string | null }>) {
  server.use(
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
          stages: Object.fromEntries(
            Object.entries(stages).map(([key, value]) => [
              key,
              { id: value.exists ? `${key}-1` : null, startedAt: null, durationMinutes: null, ...value },
            ]),
          ),
        },
      }),
    ),
  );
}

let classificationCalls = 0;
let notificationCalls = 0;

function mockClassification(isSeriousEvent: boolean | null) {
  server.use(
    http.get('http://localhost:4500/api/classifications/case/case-1', () => {
      classificationCalls++;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: 'classif-1',
          age: null,
          firstConsultationDate: null,
          isSeriousEvent,
          causedDeath: null,
          causedDisability: null,
          causedCongenitalAnomaly: null,
          causedFetalDeath: null,
          causedLifeThreatening: null,
          causedHospitalization: null,
          causedAbortion: null,
          causedOtherCondition: null,
          otherSeriousConditionDescription: null,
          notes: null,
          isActive: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          case: { caseId: 'case-1', caseCode: 'C-1', reportDate: null, eventDate: null },
          ageUnit: null,
        },
      });
    }),
  );
}

function mockNotification(requestInvestigation: boolean, delayMs = 0) {
  server.use(
    http.get('http://localhost:4500/api/notifications/case/case-1', async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      notificationCalls++;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: 'notif-1',
          notificationType: 'SEVERE',
          requestInvestigation,
          isActive: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      });
    }),
  );
}

function renderActionBarAt(activeSlug: CaseWizardStepSlug) {
  const router = createMemoryRouter(
    [
      {
        path: '/esavi-cases/:id/wizard/:step',
        element: (
          <CaseWizardProvider>
            <CaseWizardActionBar caseId="case-1" activeSlug={activeSlug} />
          </CaseWizardProvider>
        ),
      },
    ],
    { initialEntries: [`/esavi-cases/case-1/wizard/${activeSlug}`] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('CaseWizardActionBar', () => {
  it('con un paso sin registrar (placeholder de FE08) la barra no lanza y Guardar queda deshabilitado', async () => {
    mockWorkflow(false);

    renderActionBar();

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    expect(saveButton).toBeDisabled();
  });

  it("con stages.classification.exists === false el botón 'Completar etapa' está deshabilitado", async () => {
    mockWorkflow(false);

    renderActionBar();

    const completeStageButton = await screen.findByRole('button', { name: 'Completar etapa' });
    expect(completeStageButton).toBeDisabled();
  });

  it("con stages.classification.exists === true el botón 'Completar etapa' está habilitado", async () => {
    mockWorkflow(true);

    renderActionBar();

    const completeStageButton = await screen.findByRole('button', { name: 'Completar etapa' });
    expect(completeStageButton).toBeEnabled();
  });
});

describe('CaseWizardActionBar — «Siguiente» salta los pasos no requeridos (SPEC FE14b §4 paso 8)', () => {
  const OPEN_STAGES = {
    classification: { exists: true, endedAt: '2026-09-01' },
    notification: { exists: true, endedAt: null },
    investigation: { exists: false, endedAt: null },
    finalClassification: { exists: false, endedAt: null },
  };

  it('caso no grave y sin investigación: desde notification, «Siguiente» navega a closure', async () => {
    mockFullWorkflow(OPEN_STAGES);
    mockClassification(false);
    mockNotification(false);

    const user = setupUser();
    const router = renderActionBarAt('notification');

    const nextButton = await screen.findByRole('button', { name: 'Siguiente' });
    // Espera a que las dos lecturas de `useCaseWizardStepFlags` resuelvan antes de pulsar: el
    // botón ya existe con `flags === null` (destino provisional: el paso inmediato), y pulsarlo
    // demasiado pronto probaría esa carrera en vez de la regla que este test verifica.
    await waitFor(() => expect(classificationCalls).toBeGreaterThan(0));
    await waitFor(() => expect(notificationCalls).toBeGreaterThan(0));
    await user.click(nextButton);

    expect(router.state.location.pathname).toBe('/esavi-cases/case-1/wizard/closure');
  });

  it('caso grave sin investigación: desde notification, «Siguiente» navega a final-classification', async () => {
    mockFullWorkflow(OPEN_STAGES);
    mockClassification(true);
    mockNotification(false);

    const user = setupUser();
    const router = renderActionBarAt('notification');

    const nextButton = await screen.findByRole('button', { name: 'Siguiente' });
    await waitFor(() => expect(classificationCalls).toBeGreaterThan(0));
    await waitFor(() => expect(notificationCalls).toBeGreaterThan(0));
    await user.click(nextButton);

    expect(router.state.location.pathname).toBe('/esavi-cases/case-1/wizard/final-classification');
  });

  it('desde final-classification, «Siguiente» navega a closure', async () => {
    mockFullWorkflow({
      ...OPEN_STAGES,
      finalClassification: { exists: true, endedAt: null },
    });
    mockClassification(true);
    mockNotification(false);

    const user = setupUser();
    const router = renderActionBarAt('final-classification');

    const nextButton = await screen.findByRole('button', { name: 'Siguiente' });
    await user.click(nextButton);

    expect(router.state.location.pathname).toBe('/esavi-cases/case-1/wizard/closure');
  });

  it('con las banderas todavía cargando, «Siguiente» navega al paso inmediato', async () => {
    mockFullWorkflow(OPEN_STAGES);
    mockClassification(false);
    mockNotification(false, 500);

    const user = setupUser();
    const router = renderActionBarAt('notification');

    // La notificación tarda; classification.exists/notification.exists ya resolvieron por el
    // workflow, pero `flags` sigue en null mientras el `GET` de notification no responde —
    // «Siguiente» va al paso inmediato (investigation), no al de reanudación final.
    const nextButton = await screen.findByRole('button', { name: 'Siguiente' });
    expect(nextButton).toBeEnabled();
    await user.click(nextButton);

    expect(router.state.location.pathname).toBe('/esavi-cases/case-1/wizard/investigation');
  });
});
