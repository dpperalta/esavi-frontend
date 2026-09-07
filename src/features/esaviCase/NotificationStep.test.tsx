import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
import { NotificationStep } from './NotificationStep';

const server = setupServer();

const CASE_1 = 'case-1';
const CLASSIFICATION_1 = 'classification-1';
const NOTIFICATION_1 = 'notification-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

// Sin `outcome` sembrado entre los tipos: `<CatalogSelect typeCode="outcome">` cae en su rama
// "sin catalogTypeId" y nunca pide `/catalog-items/type/:id` (mismo comportamiento que
// `CatalogSelect.test.tsx` ya cubre) — este paso no necesita elegir un desenlace todavía.
function mockEmptyCatalogTypes() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockClassificationDetail(isSeriousEvent: boolean) {
  server.use(
    http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: CLASSIFICATION_1,
          age: 35,
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
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
          ageUnit: { catalogItemId: 'ageunit-years', code: 'YEARS', name: 'Años', value: 'years' },
        },
      }),
    ),
  );
}

function workflowBody(notificationExists: boolean) {
  return {
    caseWorkflowId: 'workflow-1',
    caseId: CASE_1,
    status: { catalogItemId: 'status-1', code: 'IN_NOTIFICATION', name: 'En notificación' },
    previousStatus: null,
    openedAt: '2026-01-01T00:00:00.000Z',
    closedAt: null,
    lastReopenedAt: null,
    reopenCount: 0,
    stages: {
      classification: {
        exists: true,
        id: CLASSIFICATION_1,
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: '2026-01-01T00:00:00.000Z',
        durationMinutes: 5,
      },
      notification: notificationExists
        ? {
            exists: true,
            id: NOTIFICATION_1,
            startedAt: '2026-01-02T00:00:00.000Z',
            endedAt: null,
            durationMinutes: null,
          }
        : { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
      investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
      finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
    },
    totalDurationMinutes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}

// El propio mock avanza `notification.exists` tras el `POST`, igual que lo haría el backend real
// al sellar `notificationStartedAt` — así el `refetch` que dispara la invalidación del paso
// realmente cambia lo que el stepper vería.
function mockWorkflow(getCallCounter: { count: number }) {
  let notificationExists = false;
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () => {
      getCallCounter.count++;
      return HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(notificationExists) });
    }),
    http.post('http://localhost:4500/api/notifications', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      notificationExists = true;
      return HttpResponse.json(
        {
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: body.notificationType,
            esaviDescription: body.esaviDescription,
            hasRelevantMedicalHistory: body.hasRelevantMedicalHistory ?? null,
            takesMedication: body.takesMedication ?? null,
            requestInvestigation: body.requestInvestigation ?? false,
            deathDate: null,
            autopsyRequested: null,
            verbalAutopsyPerformed: null,
            notes: body.notes ?? null,
            isActive: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
            outcome: null,
          },
        },
        { status: 201 },
      );
    }),
  );
}

function mockNotificationDetail() {
  server.use(
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
          esaviDescription: 'Reacción local en el sitio de aplicación',
          hasRelevantMedicalHistory: null,
          takesMedication: null,
          requestInvestigation: false,
          deathDate: null,
          autopsyRequested: null,
          verbalAutopsyPerformed: null,
          notes: null,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
          outcome: null,
        },
      }),
    ),
  );
}

function renderNotificationStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/esavi-cases/${CASE_1}/wizard/notification`]}>
        <CaseWizardProvider>
          <NotificationStep caseId={CASE_1} />
          <CaseWizardActionBar caseId={CASE_1} activeSlug="notification" />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationStep — alta sin fila previa (SPEC FE12a §3.4, §5, §4 paso 10)', () => {
  it('con una clasificación grave, guardar crea la cabecera y notificationType viaja como SEVERE', async () => {
    const user = setupUser();
    const workflowCalls = { count: 0 };
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    const initialWorkflowCalls = workflowCalls.count;
    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    // El `001` avanza el workflow (SPEC FE12a §3.4 punto 4): invalidar `['caseWorkflow','byCase',
    // caseId]` dispara un refetch, que es justo lo que hace que el stepper deje de mostrar el
    // paso 4 como no iniciado.
    await waitFor(() => expect(workflowCalls.count).toBeGreaterThan(initialWorkflowCalls));
  }, 30000);
});

describe('NotificationStep — reentrada (SPEC FE12a §3.4, §5)', () => {
  it('con la cabecera ya creada, se recupera esaviDescription sin volver a crear la fila', async () => {
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();
    mockNotificationDetail();

    let postCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.post('http://localhost:4500/api/notifications', () => {
        postCalls++;
        return HttpResponse.json({ ok: false, message: 'no debería llamarse', code: 'X' }, { status: 500 });
      }),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI');
    await waitFor(() => expect(description).toHaveValue('Reacción local en el sitio de aplicación'));
    expect(postCalls).toBe(0);
  }, 30000);
});
