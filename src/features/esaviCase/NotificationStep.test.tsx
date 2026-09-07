import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
// `CatalogSelect.test.tsx` ya cubre) — los tests que no tocan la sección de fallecimiento no
// necesitan elegir un desenlace.
function mockEmptyCatalogTypes() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// `outcomeItemId` pasa por `z.string().uuid()` (SPEC FE12a §3.5) — los fixtures necesitan forma
// de UUID real o `notificationSaveSchema` rechaza el envío antes de llegar al `POST`.
const OUTCOME_TYPE = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTCOME_DEATH = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTCOME_RECOVERED = 'aaaaaaaa-0000-4000-8000-000000000003';

// Con `outcome` sembrado y sus dos ítems (SPEC FE12a §4 paso 11): lo que necesita el test que
// elige «Fallecido» y luego cambia a «Recuperado».
function mockOutcomeCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogTypeId: OUTCOME_TYPE,
              code: 'outcome',
              name: 'Desenlace',
              description: null,
              sortOrder: 0,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${OUTCOME_TYPE}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            {
              catalogItemId: OUTCOME_DEATH,
              catalogTypeId: OUTCOME_TYPE,
              code: 'DEATH',
              name: 'Fallecido',
              value: 'DEATH',
              isValueLocked: true,
              description: null,
              sortOrder: 0,
              metadata: null,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
            {
              catalogItemId: OUTCOME_RECOVERED,
              catalogTypeId: OUTCOME_TYPE,
              code: 'RECOVERED',
              name: 'Recuperado',
              value: 'RECOVERED',
              isValueLocked: true,
              description: null,
              sortOrder: 1,
              metadata: null,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
  );
}

function mockCaseDetail() {
  server.use(
    http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseId: CASE_1,
          caseCode: 'ESAVI-2026-0001',
          reportDate: null,
          eventDate: '2026-01-15',
          countryIsoCode: null,
          reportFillingDate: null,
          notificationOrganization: null,
          details: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
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
          healthFacility: { healthFacilityId: 'hfac-1', localCode: 'HF-01', name: 'Centro Norte' },
        },
      }),
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
    mockCaseDetail();
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
    mockCaseDetail();
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

describe('NotificationStep — sección de fallecimiento (SPEC FE12a §3.5, §7, §4 paso 11)', () => {
  it('elegir «Fallecido», rellenar los tres y cambiar a «Recuperado» limpia los tres a null en el PUT', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockClassificationDetail(true);
    mockOutcomeCatalog();

    let notificationExists = false;
    let lastPostBody: Record<string, unknown> | null = null;
    let lastPutBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(notificationExists) }),
      ),
      // `stages.notification.exists` pasa a `true` tras el `POST`, lo que habilita este `006`
      // (sin `staleTime`, se refetchea) — sin mockearlo, ese refetch falla y `NotificationStep`
      // desmonta el formulario por su rama de error (SPEC FE12a §3.4).
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
            deathDate: lastPostBody?.deathDate ?? null,
            autopsyRequested: lastPostBody?.autopsyRequested ?? null,
            verbalAutopsyPerformed: lastPostBody?.verbalAutopsyPerformed ?? null,
            notes: null,
            isActive: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
            outcome: { catalogItemId: OUTCOME_DEATH, code: 'DEATH', name: 'Fallecido', value: 'DEATH' },
          },
        }),
      ),
      http.post('http://localhost:4500/api/notifications', async ({ request }) => {
        lastPostBody = (await request.json()) as Record<string, unknown>;
        notificationExists = true;
        return HttpResponse.json(
          {
            ok: true,
            message: 'ok',
            data: {
              notificationId: NOTIFICATION_1,
              notificationType: lastPostBody.notificationType,
              esaviDescription: lastPostBody.esaviDescription,
              hasRelevantMedicalHistory: null,
              takesMedication: null,
              requestInvestigation: false,
              deathDate: lastPostBody.deathDate ?? null,
              autopsyRequested: lastPostBody.autopsyRequested ?? null,
              verbalAutopsyPerformed: lastPostBody.verbalAutopsyPerformed ?? null,
              notes: null,
              isActive: true,
              createdAt: '2026-01-02T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
              case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
              outcome: { catalogItemId: OUTCOME_DEATH, code: 'DEATH', name: 'Fallecido', value: 'DEATH' },
            },
          },
          { status: 201 },
        );
      }),
      http.put(`http://localhost:4500/api/notifications/${NOTIFICATION_1}`, async ({ request }) => {
        lastPutBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            hasRelevantMedicalHistory: null,
            takesMedication: null,
            requestInvestigation: false,
            deathDate: lastPutBody.deathDate ?? null,
            autopsyRequested: lastPutBody.autopsyRequested ?? null,
            verbalAutopsyPerformed: lastPutBody.verbalAutopsyPerformed ?? null,
            notes: null,
            isActive: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
            deletedAt: null,
            appDetails: [],
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
            outcome: { catalogItemId: OUTCOME_RECOVERED, code: 'RECOVERED', name: 'Recuperado', value: 'RECOVERED' },
          },
        });
      }),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await user.click(await screen.findByRole('combobox', { name: 'Desenlace' }));
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));

    const deathDateInput = await screen.findByLabelText('Fecha de fallecimiento');
    fireEvent.change(deathDateInput, { target: { value: '2026-01-16' } });
    await user.click(screen.getByRole('switch', { name: '¿Se solicitó autopsia?' }));
    await user.click(screen.getByRole('switch', { name: '¿Se realizó autopsia verbal?' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(lastPostBody).not.toBeNull());
    expect(lastPostBody).toMatchObject({
      outcomeItemId: OUTCOME_DEATH,
      deathDate: '2026-01-16',
      autopsyRequested: true,
      verbalAutopsyPerformed: true,
    });

    // Cambiar a «Recuperado»: la sección desaparece y los tres campos se limpian en el propio
    // estado del formulario, sin esperar a un segundo guardado (SPEC FE12a §3.5).
    await user.click(await screen.findByRole('combobox', { name: 'Desenlace' }));
    await user.click(await screen.findByRole('option', { name: 'Recuperado' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Fecha de fallecimiento')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(lastPutBody).not.toBeNull());
    expect(lastPutBody).toMatchObject({
      outcomeItemId: OUTCOME_RECOVERED,
      deathDate: null,
      autopsyRequested: null,
      verbalAutopsyPerformed: null,
    });
  }, 30000);

  it('deathDate anterior a eventDate bloquea el guardado en el cliente', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockClassificationDetail(true);
    mockOutcomeCatalog();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);
    // A propósito, sin handler de POST /api/notifications adicional al de `mockWorkflow`: si el
    // cliente llegara a intentarlo con una fecha inválida, ese POST respondería 500 y el test lo
    // detectaría por el toast de error en vez de por la ausencia de llamada.

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await user.click(await screen.findByRole('combobox', { name: 'Desenlace' }));
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));

    const deathDateInput = await screen.findByLabelText('Fecha de fallecimiento');
    fireEvent.change(deathDateInput, { target: { value: '2026-01-10' } });
    await user.click(screen.getByRole('switch', { name: '¿Se solicitó autopsia?' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(
      await screen.findByText('La fecha de fallecimiento no puede ser anterior a la fecha del evento.'),
    ).toBeInTheDocument();
  }, 30000);
});
