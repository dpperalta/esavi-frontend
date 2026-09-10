import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useDraftsStore } from '@/shared/stores/draftsStore';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
import { NotificationStep } from './NotificationStep';

// Ningún test de este archivo monta `<Toaster>` (sonner necesita el tema resuelto vía
// `preferencesStore`) — para el mapeo de errores propios del bloque de embarazo (SPEC FE12d §4
// paso 8) hace falta el texto exacto del toast, así que se sustituye `sonner` por el mismo espía
// que ya usa `PregnancyComplicationList.test.tsx`.
const toastError = vi.fn();

// Cada `<SatelliteList>` pinta su `<h3>` y su «Añadir» en la misma fila, así que la sección se
// localiza por su encabezado y no por la posición del botón: el reorden de SPEC FE12e §4 paso 8
// cambió el orden en que se montan las listas.
async function findAddButtonOf(sectionTitle: string) {
  const heading = await screen.findByRole('heading', { name: sectionTitle });
  return within(heading.parentElement as HTMLElement).getByRole('button', { name: 'Añadir' });
}
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

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

// `usePregnancyGate` (SPEC FE12d §4 paso 6) pide `ESAVI-SYSCONF-006` en cada montaje del paso, no
// sólo en los tests de la compuerta — sin este respaldo, `onUnhandledRequest: 'error'' tumbaría el
// resto de la suite. `404` es "no sembrada", el mismo caso que el resto de este archivo ya
// asumía cuando comparaba sólo contra `sex.value`; los tests que necesitan la fila sembrada la
// declaran aparte con `mockFemaleSexItemConfig`.
function mockFemaleSexItemConfigNotSeeded() {
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', () =>
      HttpResponse.json(
        { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

function mockFemaleSexItemConfig(catalogItemId: string) {
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          systemConfigId: 'sc-pregnancy-female-sex-item',
          code: 'PREGNANCY_FEMALE_SEX_ITEM',
          name: 'Ítem de sexo femenino',
          description: null,
          value: catalogItemId,
          valueType: 'string',
          scope: 'GLOBAL',
          isEncrypted: false,
          isEditable: true,
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

beforeEach(() => {
  localStorage.clear();
  useDraftsStore.setState({ drafts: {} });
  mockFemaleSexItemConfigNotSeeded();
  mockMedicalHistories([]);
  toastError.mockClear();
});

// `ESAVI-MEDHIST-006` — la séptima lista satélite (SPEC FE12e §3.2). Se responde vacía por
// defecto y los tests que la necesitan poblada la vuelven a declarar.
function mockMedicalHistories(rows: unknown[]) {
  server.use(
    http.get(`http://localhost:4500/api/notification-medical-histories/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

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

function mockPatientDetail(sexValue: string | null) {
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
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          sex: sexValue
            ? { catalogItemId: `sex-${sexValue}`, code: sexValue, name: sexValue, value: sexValue }
            : null,
          residence: null,
        },
      }),
    ),
  );
}

function mockClassificationDetail(isSeriousEvent: boolean, age: number | null = 35) {
  server.use(
    http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: CLASSIFICATION_1,
          age,
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

const SEVERE_NOTIFICATION_1 = 'severe-notification-1';
const NON_SEVERE_NOTIFICATION_1 = 'non-severe-notification-1';

// La rama grave, en su forma más simple: no existe hasta que el `POST` la crea, igual que hace
// `mockWorkflow` con la cabecera. Usado por los tests que no examinan la rama en sí, sólo
// necesitan que la cadena de guardado (SPEC FE12a §4 paso 12) no explote contra un endpoint sin
// mockear.
function mockSevereNotificationBranch() {
  let exists = false;
  let lastPostBody: Record<string, unknown> | null = null;
  server.use(
    http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () => {
      if (!exists) {
        return HttpResponse.json(
          { ok: false, message: 'no encontrada', code: 'SEVNOT_006_NOT_FOUND' },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: SEVERE_NOTIFICATION_1,
          hasPreviousEventHistory: lastPostBody?.hasPreviousEventHistory ?? null,
          hasAllergyToOtherVaccines: lastPostBody?.hasAllergyToOtherVaccines ?? null,
          hasAllergyToMedications: lastPostBody?.hasAllergyToMedications ?? null,
          hasAllergyToPreviousSameVaccine: lastPostBody?.hasAllergyToPreviousSameVaccine ?? null,
          hasPregnancyComplications: null,
          pregnancyComplicationsDescription: null,
          notes: lastPostBody?.notes ?? null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          notification: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            isActive: true,
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
          },
        },
      });
    }),
    http.post('http://localhost:4500/api/severe-notifications', async ({ request }) => {
      lastPostBody = (await request.json()) as Record<string, unknown>;
      exists = true;
      return HttpResponse.json(
        {
          ok: true,
          message: 'ok',
          data: {
            notificationId: SEVERE_NOTIFICATION_1,
            hasPreviousEventHistory: lastPostBody.hasPreviousEventHistory ?? null,
            hasAllergyToOtherVaccines: lastPostBody.hasAllergyToOtherVaccines ?? null,
            hasAllergyToMedications: lastPostBody.hasAllergyToMedications ?? null,
            hasAllergyToPreviousSameVaccine: lastPostBody.hasAllergyToPreviousSameVaccine ?? null,
            hasPregnancyComplications: null,
            pregnancyComplicationsDescription: null,
            notes: lastPostBody.notes ?? null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            notification: {
              notificationId: NOTIFICATION_1,
              notificationType: 'SEVERE',
              esaviDescription: 'Reacción local en el sitio de aplicación',
              isActive: true,
              case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
            },
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
    mockSevereNotificationBranch();

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
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
    mockSevereNotificationBranch();

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

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
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
      // Este test no examina la rama en sí — sólo que la cadena de guardado (SPEC FE12a §4 paso
      // 12) no se rompa contra un endpoint sin mockear.
      http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrada', code: 'SEVNOT_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/severe-notifications', () =>
        HttpResponse.json(
          {
            ok: true,
            message: 'ok',
            data: {
              notificationId: 'severe-notification-1',
              hasPreviousEventHistory: null,
              hasAllergyToOtherVaccines: null,
              hasAllergyToMedications: null,
              hasAllergyToPreviousSameVaccine: null,
              hasPregnancyComplications: null,
              pregnancyComplicationsDescription: null,
              notes: null,
              createdAt: '2026-01-02T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
              notification: {
                notificationId: NOTIFICATION_1,
                notificationType: 'SEVERE',
                esaviDescription: 'Reacción local en el sitio de aplicación',
                isActive: true,
                case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
              },
            },
          },
          { status: 201 },
        ),
      ),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await user.click(await screen.findByRole('combobox', { name: 'Desenlace' }));
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));

    const deathDateInput = await screen.findByLabelText('Si la persona murió, indique la fecha de la muerte');
    fireEvent.change(deathDateInput, { target: { value: '2026-01-16' } });
    await user.click(screen.getByRole('switch', { name: '¿Se solicitó una autopsia?' }));
    await user.click(screen.getByRole('switch', { name: '¿Fue hecha una autopsia verbal?' }));

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
      expect(screen.queryByLabelText('Si la persona murió, indique la fecha de la muerte')).not.toBeInTheDocument(),
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

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await user.click(await screen.findByRole('combobox', { name: 'Desenlace' }));
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));

    const deathDateInput = await screen.findByLabelText('Si la persona murió, indique la fecha de la muerte');
    fireEvent.change(deathDateInput, { target: { value: '2026-01-10' } });
    await user.click(screen.getByRole('switch', { name: '¿Se solicitó una autopsia?' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(
      await screen.findByText('La fecha de fallecimiento no puede ser anterior a la fecha del evento.'),
    ).toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — cadena de guardado, la rama falla y se reintenta (SPEC FE12a §4 paso 12, §5)', () => {
  it('si el POST de la rama falla, la cabecera sigue creada; el reintento la completa sin repetir el POST de la cabecera', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();

    let notificationExists = false;
    let headerPostCalls = 0;
    const branchExists = false;
    let branchPostCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(notificationExists) }),
      ),
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
      http.post('http://localhost:4500/api/notifications', async ({ request }) => {
        headerPostCalls++;
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
          },
          { status: 201 },
        );
      }),
      http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () => {
        if (!branchExists) {
          return HttpResponse.json(
            { ok: false, message: 'no encontrada', code: 'SEVNOT_006_NOT_FOUND' },
            { status: 404 },
          );
        }
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: 'severe-notification-1',
            hasPreviousEventHistory: null,
            hasAllergyToOtherVaccines: null,
            hasAllergyToMedications: null,
            hasAllergyToPreviousSameVaccine: null,
            hasPregnancyComplications: null,
            pregnancyComplicationsDescription: null,
            notes: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            notification: {
              notificationId: NOTIFICATION_1,
              notificationType: 'SEVERE',
              esaviDescription: 'Reacción local en el sitio de aplicación',
              isActive: true,
              case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
            },
          },
        });
      }),
      http.put(`http://localhost:4500/api/notifications/${NOTIFICATION_1}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: body.esaviDescription,
            hasRelevantMedicalHistory: null,
            takesMedication: null,
            requestInvestigation: false,
            deathDate: null,
            autopsyRequested: null,
            verbalAutopsyPerformed: null,
            notes: null,
            isActive: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
            deletedAt: null,
            appDetails: [],
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
            outcome: null,
          },
        });
      }),
      // El primer POST de la rama falla (error genérico); el segundo — el reintento — responde
      // `SEVNOT_001_ALREADY_EXISTS`, que se trata como éxito (SPEC FE12a §3.5, §6): el primer
      // intento sí llegó al servidor, sólo se perdió la respuesta.
      http.post('http://localhost:4500/api/severe-notifications', () => {
        branchPostCalls++;
        if (branchPostCalls === 1) {
          return HttpResponse.json(
            { ok: false, message: 'error del servidor', code: 'SEVNOT_001_CREATION_FAILED' },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          { ok: false, message: 'ya existe', code: 'SEVNOT_001_ALREADY_EXISTS' },
          { status: 409 },
        );
      }),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    // La cabecera se creó pese al fallo de la rama.
    await waitFor(() => expect(headerPostCalls).toBe(1));
    await waitFor(() => expect(branchPostCalls).toBe(1));
    // Sigue visible: el mismo campo, ya guardado, no desaparece ni se limpia.
    expect(screen.getByLabelText('Descripción del ESAVI (signos y síntomas)')).toHaveValue(
      'Reacción local en el sitio de aplicación',
    );

    // El reintento: un segundo "Guardar" no repite el POST de la cabecera — sólo el de la rama —
    // y el `SEVNOT_001_ALREADY_EXISTS` no se muestra como error.
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(branchPostCalls).toBe(2));
    expect(headerPostCalls).toBe(1);
    expect(screen.queryByText('ya existe')).not.toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — compuerta de embarazo (CASE-PROCESS.md §7.4, SPEC FE12a §4 paso 13)', () => {
  it('con paciente masculino, ningún campo de embarazo existe en el DOM', async () => {
    mockCaseDetail();
    mockPatientDetail('MALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    // Se espera a que el formulario esté listo (una bandera de la rama grave ya renderizada) antes
    // de afirmar la ausencia — de lo contrario un falso negativo por el skeleton pasaría el test.
    // Desde SPEC FE12e §4 paso 7 las banderas van en línea: ya no hay bloque con título propio.
    await screen.findByText('¿Tiene antecedentes de eventos previos similares al actual?');

    expect(
      screen.queryByRole('combobox', { name: '¿Tuvo complicaciones el embarazo?' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Si aplica')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Describa complicaciones (Haga un resumen cronológico de la historia clínica relacionada con la complicación del embarazo actual)'),
    ).not.toBeInTheDocument();
  }, 30000);

  it('con paciente femenino y edad desconocida, el bloque aparece marcado «Si aplica»', async () => {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockClassificationDetail(true, null);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    expect(
      await screen.findByRole('combobox', { name: '¿Tuvo complicaciones el embarazo?' }),
    ).toBeInTheDocument();
    // Una sola marca desde SPEC FE12e §4 paso 7: disuelta la ficha grave, `PregnancySection` es
    // el único bloque que pinta la compuerta.
    expect(screen.getAllByText('Si aplica')).toHaveLength(1);
  }, 30000);

  it('con paciente femenino en edad fértil, el bloque aparece sin la marca', async () => {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    expect(
      await screen.findByRole('combobox', { name: '¿Tuvo complicaciones el embarazo?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Si aplica')).not.toBeInTheDocument();
  }, 30000);

  it('con la fila de configuración sembrada y el catalogItemId del paciente igual al suyo, sigue visible sin la marca (SPEC FE12d §3.5, §4 paso 6)', async () => {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    expect(
      await screen.findByRole('combobox', { name: '¿Tuvo complicaciones el embarazo?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Si aplica')).not.toBeInTheDocument();
  }, 30000);

  it('con la fila de configuración apuntando a un ítem distinto del que lleva value === FEMALE, la compuerta sigue al servidor y marca «Si aplica» (SPEC FE12d §3.5, §7.2)', async () => {
    mockCaseDetail();
    // El paciente lleva `sex.value === 'FEMALE'` pero la fila de configuración apunta a otro
    // `catalogItemId` — el despliegue desalineado de §7.2. La comparación por `catalogItemId`
    // (lo que compara `ESAVI-NOTIFPRG-001`) ya no confirma «femenino», así que el bloque se
    // muestra pero sin la certeza de «Visible, normal» — evita el `400 PATIENT_NOT_FEMALE` sobre
    // un bloque que antes se mostraba abierto sin reservas.
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-OTHER-ITEM');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    expect(
      await screen.findByRole('combobox', { name: '¿Tuvo complicaciones el embarazo?' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Si aplica')).toHaveLength(1);
  }, 30000);

  it('con la fila de configuración ausente, el bloque sale deshabilitado con su explicación y el resto del paso 4 sigue utilizable (SPEC FE12d §4 paso 7)', async () => {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    // Sin `mockFemaleSexItemConfig`: el `beforeEach` ya deja la fila en «no sembrada» (404).
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    renderNotificationStep();

    expect(
      await screen.findByText(
        'El registro de embarazo no está configurado en este despliegue. Pídelo a un administrador.',
      ),
    ).toBeInTheDocument();
    const wasPregnantField = screen.getByRole('combobox', {
      name: '¿Estaba embarazada al momento de la vacunación?',
    });
    expect(wasPregnantField).toBeDisabled();

    // El resto del paso 4 sigue utilizable: la descripción del ESAVI se puede escribir y guardar
    // funciona con normalidad, sin que el bloque deshabilitado lo bloquee.
    const description = screen.getByLabelText('Descripción del ESAVI (signos y síntomas)');
    expect(description).toBeEnabled();
  }, 30000);
});

describe('NotificationStep — error de carga (SPEC FE12a §3.6, §4 paso 15)', () => {
  it('con un 006 fallido, muestra el mensaje y un botón de reintentar que recupera la pantalla', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();

    let notificationCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () => {
        notificationCalls++;
        if (notificationCalls === 1) {
          return HttpResponse.json(
            { ok: false, message: 'error del servidor', code: 'NOTIFCN_006_NOT_FOUND' },
            { status: 404 },
          );
        }
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
        });
      }),
    );
    mockSevereNotificationBranch();

    renderNotificationStep();

    expect(await screen.findByText('No pudimos cargar la notificación.')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Reintentar' });

    await user.click(retryButton);

    expect(await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)')).toHaveValue(
      'Reacción local en el sitio de aplicación',
    );
    expect(screen.queryByText('No pudimos cargar la notificación.')).not.toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — clasificación desactivada (CASE-PROCESS.md §6.2, SPEC FE12a §3.6, §4 paso 16)', () => {
  it('con stages.classification.exists pero el 006 de classification en 404, muestra el aviso de reactivar', async () => {
    mockCaseDetail();
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    // `stages.classification.exists` cuenta también filas desactivadas (§6.2) — el `006` propio
    // de classification, en cambio, filtra por `isActive` para cualquiera que no sea SUPERADMIN,
    // así que un `USER` recibe 404 justo cuando el workflow dice que la fila existe.
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrada', code: 'CLASSIF_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    renderNotificationStep();

    expect(
      await screen.findByText(
        'La clasificación de este caso está dada de baja. Hace falta que un administrador la reactive antes de poder notificar.',
      ),
    ).toBeInTheDocument();
    // Ni la cabecera ni el formulario se muestran — el aviso reemplaza la pantalla entera.
    expect(screen.queryByLabelText('Descripción del ESAVI (signos y síntomas)')).not.toBeInTheDocument();
    // Sin botón de reactivar (SPEC FE12a §3.6): `005B` es SUPERADMIN, y ofrecerlo a casi
    // cualquiera es peor que explicar qué falta.
    expect(screen.queryByRole('button', { name: /reactivar/i })).not.toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — borrador persistido (SPEC FE12a §3.4, §4 paso 16)', () => {
  it('con un borrador cuyo baseUpdatedAt coincide (null, sin fila todavía), se restaura sobre los valores de la fila', async () => {
    mockCaseDetail();
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);

    useDraftsStore.getState().set(
      CASE_1,
      'notification',
      { esaviDescription: 'Borrador recuperado de otra pestaña' },
      null,
    );

    renderNotificationStep();

    // El toast de aviso ("se recuperaron cambios...") no se verifica aquí: ningún test de este
    // repositorio monta `<Toaster>` (sonner necesita el tema resuelto vía `preferencesStore`), y
    // el efecto observable real — el valor restaurado — ya lo cubre esta aserción.
    expect(await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)')).toHaveValue(
      'Borrador recuperado de otra pestaña',
    );
  }, 30000);

  it('con un borrador cuyo baseUpdatedAt no coincide con la fila, gana la fila y se descarta con aviso', async () => {
    mockCaseDetail();
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();
    mockNotificationDetail();
    mockSevereNotificationBranch();
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
    );

    // La fila real trae `updatedAt: null` (`mockNotificationDetail`) — un borrador que dice venir
    // de una fila con otro `updatedAt` no coincide, así que la fila gana.
    useDraftsStore.getState().set(
      CASE_1,
      'notification',
      { esaviDescription: 'Borrador obsoleto' },
      '2020-01-01T00:00:00.000Z',
    );

    renderNotificationStep();

    expect(await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)')).toHaveValue(
      'Reacción local en el sitio de aplicación',
    );
    // Se descarta: el efecto observable es que la fila ganó (arriba) y que el borrador ya no
    // está en la tienda — el toast de aviso no se verifica aquí por la misma razón que en el
    // test anterior.
    await waitFor(() =>
      expect(useDraftsStore.getState().get(CASE_1, 'notification')).toBeUndefined(),
    );
  }, 30000);

  it('escribe el borrador con rebote y lo borra en cuanto el guardado completo responde', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockClassificationDetail(true);
    mockEmptyCatalogTypes();
    const workflowCalls = { count: 0 };
    mockWorkflow(workflowCalls);
    mockSevereNotificationBranch();

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await waitFor(
      () =>
        expect(useDraftsStore.getState().get(CASE_1, 'notification')?.values).toMatchObject({
          esaviDescription: 'Reacción local en el sitio de aplicación',
        }),
      { timeout: 3000 },
    );

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(useDraftsStore.getState().get(CASE_1, 'notification')).toBeUndefined());
  }, 30000);
});

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

const MEDICATION_ROW = {
  medicationId: 'med-1',
  notificationId: NOTIFICATION_1,
  sortOrder: 1,
  medicationName: 'Paracetamol',
  medicationCode: null,
  dose: null,
  pharmaceuticalFormItemId: null,
  administrationRouteItemId: null,
  startDate: null,
  isOtherMedication: false,
  otherMedicationText: null,
  isActive: true,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  pharmaceuticalForm: null,
  administrationRoute: null,
};

// Reentrada con la cabecera ya en `takesMedication: 'YES'` — la compuerta de SPEC FE12b §4 paso 11
// sólo se puede observar en reentrada, con la fila de `notification` ya creada.
function mockReentryWithMedications(rows: unknown[]) {
  mockCaseDetail();
  mockPatientDetail('MALE');
  mockClassificationDetail(true);
  mockSevereNotificationBranch();
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
          esaviDescription: 'Reacción local en el sitio de aplicación',
          hasRelevantMedicalHistory: null,
          takesMedication: 'YES',
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
    http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

describe('NotificationStep — compuerta de takesMedication (SPEC FE12b §4 paso 11)', () => {
  it('con una medicación cargada y rol USER, el campo queda deshabilitado y menciona a un administrador', async () => {
    signInAs('USER', 25);
    mockReentryWithMedications([MEDICATION_ROW]);

    renderNotificationStep();

    const field = await screen.findByRole('combobox', { name: '¿El paciente estaba tomando algún medicamento cuando se vacunó?' });
    await waitFor(() => expect(field).toBeDisabled());
    expect(await screen.findByText(/Hace falta un administrador/)).toBeInTheDocument();
  }, 30000);

  it('con una medicación cargada y rol ADMIN, el campo queda deshabilitado sin mencionar a un administrador', async () => {
    signInAs('ADMIN', 50);
    mockReentryWithMedications([MEDICATION_ROW]);

    renderNotificationStep();

    const field = await screen.findByRole('combobox', { name: '¿El paciente estaba tomando algún medicamento cuando se vacunó?' });
    await waitFor(() => expect(field).toBeDisabled());
    expect(await screen.findByText(/Bórralas una a una/)).toBeInTheDocument();
    expect(screen.queryByText(/administrador/)).not.toBeInTheDocument();
  }, 30000);

  it('borrada la última fila, el campo vuelve a ser editable sin recargar', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    let rows: unknown[] = [MEDICATION_ROW];
    mockCaseDetail();
    mockPatientDetail('MALE');
    mockClassificationDetail(true);
    mockSevereNotificationBranch();
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            hasRelevantMedicalHistory: null,
            takesMedication: 'YES',
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
      http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
      ),
      http.delete(`http://localhost:4500/api/notification-medications/${MEDICATION_ROW.medicationId}`, () => {
        rows = [];
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderNotificationStep();

    const field = await screen.findByRole('combobox', { name: '¿El paciente estaba tomando algún medicamento cuando se vacunó?' });
    await waitFor(() => expect(field).toBeDisabled());

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Paracetamol' });
    await user.click(deleteButton);
    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(field).not.toBeDisabled());
  }, 30000);
});

// SPEC FE12b §4 paso 12 — el primer obligatorio de proceso del paso 4, sólo observable en
// reentrada (necesita `notificationId` para poder mostrar la lista de eventos).
function mockReentryWithEvents(eventRows: unknown[]) {
  mockCaseDetail();
  mockPatientDetail('MALE');
  mockClassificationDetail(true);
  mockSevereNotificationBranch();
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
          esaviDescription: 'Reacción local en el sitio de aplicación',
          hasRelevantMedicalHistory: 'NO',
          takesMedication: 'NO',
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
    http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: eventRows.length, rows: eventRows } }),
    ),
    http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.put(`http://localhost:4500/api/notifications/${NOTIFICATION_1}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
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
          updatedAt: '2026-01-03T00:00:00.000Z',
          deletedAt: null,
          appDetails: [],
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
          outcome: null,
        },
      });
    }),
    http.put(`http://localhost:4500/api/severe-notifications/${SEVERE_NOTIFICATION_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: SEVERE_NOTIFICATION_1,
          hasPreviousEventHistory: null,
          hasAllergyToOtherVaccines: null,
          hasAllergyToMedications: null,
          hasAllergyToPreviousSameVaccine: null,
          hasPregnancyComplications: null,
          pregnancyComplicationsDescription: null,
          notes: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
  );
}

const EVENT_ROW = {
  eventId: 'evt-1',
  notificationId: NOTIFICATION_1,
  diagnosticTermId: null,
  sortOrder: 1,
  esaviName: 'Fiebre alta',
  esaviCode: null,
  esaviRawName: null,
  isMainEsavi: false,
  startDate: null,
  startTime: null,
  isOtherEsavi: false,
  otherDescription: null,
  notes: null,
  isActive: true,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  diagnosticTerm: null,
};

describe('NotificationStep — «al menos un evento» en «Completar etapa» (SPEC FE12b §4 paso 12)', () => {
  it('con cero eventos, la lista de pendientes de «Completar etapa» incluye «Al menos un evento del ESAVI»', async () => {
    mockReentryWithEvents([]);

    renderNotificationStep();

    await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    expect(await screen.findByText('Al menos un evento del ESAVI')).toBeInTheDocument();
  }, 30000);

  it('con un evento, «Al menos un evento del ESAVI» ya no aparece entre los pendientes', async () => {
    mockReentryWithEvents([EVENT_ROW]);

    renderNotificationStep();

    await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await waitFor(() => expect(screen.queryByText('Al menos un evento del ESAVI')).not.toBeInTheDocument());
  }, 30000);

  it('«Guardar» funciona igual con cero eventos pendientes', async () => {
    const user = setupUser();
    mockReentryWithEvents([]);

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.clear(description);
    await user.type(description, 'Reacción local en el sitio de aplicación, editada');

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(screen.getByLabelText('Descripción del ESAVI (signos y síntomas)')).toHaveValue(
      'Reacción local en el sitio de aplicación, editada',
    ));
  }, 30000);
});

// SPEC FE12b §4 paso 14 — integración de extremo a extremo: los dos satélites, montados junto a
// `CaseWizardProvider` y `CaseWizardActionBar`, coexisten dentro del mismo paso 4. Las ramas de
// `source`, los tres caminos del nombre de la medicación, las cuatro reglas condicionales y los
// tres estados de la compuerta ya están cada uno probado por separado (pasos 7-13); esta prueba
// verifica el cableado real de `NotificationStep`, no vuelve a demostrar la lógica de negocio.
describe('NotificationStep — los dos satélites conviven en el mismo paso (SPEC FE12b §4 paso 14)', () => {
  it('crear un evento y una medicación en la misma sesión, con la cabecera ya creada', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail('MALE');
    mockClassificationDetail(true);
    mockSevereNotificationBranch();
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            hasRelevantMedicalHistory: 'NO',
            takesMedication: 'YES',
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
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    let events: unknown[] = [];
    server.use(
      http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: events.length, rows: events } }),
      ),
      http.get('http://localhost:4500/api/meddra/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/notification-events', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const created = {
          eventId: 'evt-1',
          notificationId: NOTIFICATION_1,
          diagnosticTermId: null,
          sortOrder: 1,
          esaviName: body.esaviName,
          esaviCode: null,
          esaviRawName: null,
          isMainEsavi: false,
          startDate: null,
          startTime: null,
          isOtherEsavi: false,
          otherDescription: null,
          notes: null,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          diagnosticTerm: null,
        };
        events = [created];
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    let medications: unknown[] = [];
    server.use(
      http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: medications.length, rows: medications },
        }),
      ),
      http.get('http://localhost:4500/api/whodrug-products/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { term: 'par', count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const created = {
          medicationId: 'med-1',
          notificationId: NOTIFICATION_1,
          sortOrder: 1,
          medicationName: body.medicationName,
          medicationCode: null,
          dose: null,
          pharmaceuticalFormItemId: null,
          administrationRouteItemId: null,
          startDate: null,
          isOtherMedication: false,
          otherMedicationText: null,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          pharmaceuticalForm: null,
          administrationRoute: null,
        };
        medications = [created];
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    renderNotificationStep();

    await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');

    const addEventButton = await findAddButtonOf('Eventos adversos');

    // El evento, por texto libre — las tres ramas de `source` ya están probadas en
    // `EventFormDialog.test.tsx`; aquí sólo hace falta que el flujo complete. El diálogo se monta
    // sobre la pantalla sin desmontar el «Guardar» de `CaseWizardActionBar` — el suyo propio es
    // el último en el documento, dentro del `<Dialog>`.
    await user.click(addEventButton);
    await user.type(await screen.findByLabelText('Evento adverso'), 'Fiebre alta');
    await user.keyboard('{Escape}');
    const dialogSaveButtons = await screen.findAllByRole('button', { name: 'Guardar' });
    await user.click(dialogSaveButtons[dialogSaveButtons.length - 1]);
    await waitFor(() => expect(screen.getAllByText('Fiebre alta').length).toBeGreaterThan(0));

    // La medicación, también por texto libre — los tres caminos del nombre ya están probados en
    // `MedicationFormDialog.test.tsx`.
    await user.click(await findAddButtonOf('Antecedentes farmacológicos'));
    await user.type(await screen.findByLabelText('Medicamento'), 'Paracetamol');
    await user.keyboard('{Escape}');
    const dialogSaveButtons2 = await screen.findAllByRole('button', { name: 'Guardar' });
    await user.click(dialogSaveButtons2[dialogSaveButtons2.length - 1]);

    await waitFor(() => expect(screen.getAllByText('Paracetamol').length).toBeGreaterThan(0));
    // Y el evento sigue ahí: crear la medicación no desplazó ni ocultó la lista de eventos.
    expect(screen.getAllByText('Fiebre alta').length).toBeGreaterThan(0);
  }, 120000);
});

describe('NotificationStep — cadena de guardado, el bloque de embarazo (SPEC FE12d §4 paso 8)', () => {
  it('con wasPregnantAtVaccination respondido, el guardado encadena el 001 del bloque de embarazo', async () => {
    const user = setupUser();
    const workflowCalls = { count: 0 };
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockWorkflow(workflowCalls);
    mockSevereNotificationBranch();

    let pregnancyPostCalls = 0;
    let lastPregnancyPostBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/notification-pregnancies', async ({ request }) => {
        pregnancyPostCalls++;
        lastPregnancyPostBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            ok: true,
            message: 'ok',
            data: {
              pregnancyId: 'pregnancy-1',
              notificationId: NOTIFICATION_1,
              wasPregnantAtVaccination: lastPregnancyPostBody.wasPregnantAtVaccination,
              wasPregnantAtEsavi: null,
              lastMenstruationDate: null,
              probableDeliveryDate: null,
              hasComplications: null,
              notes: null,
              isActive: true,
              createdAt: '2026-01-02T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          },
          { status: 201 },
        );
      }),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    await user.click(
      await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(pregnancyPostCalls).toBe(1));
    expect(lastPregnancyPostBody).toMatchObject({
      notificationId: NOTIFICATION_1,
      wasPregnantAtVaccination: 'NO',
    });
  }, 30000);

  it('con el bloque de embarazo intacto, el guardado no dispara el 001 de embarazo (decisión de este paso, no del spec)', async () => {
    const user = setupUser();
    const workflowCalls = { count: 0 };
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockWorkflow(workflowCalls);
    mockSevereNotificationBranch();

    let pregnancyPostCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/notification-pregnancies', () => {
        pregnancyPostCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} }, { status: 201 });
      }),
    );

    renderNotificationStep();

    const description = await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    await user.type(description, 'Reacción local en el sitio de aplicación');

    // La compuerta está abierta (paciente femenino, 30 años) — confirmado por la presencia del
    // campo, sin tocarlo.
    await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' });

    const initialWorkflowCalls = workflowCalls.count;
    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(workflowCalls.count).toBeGreaterThan(initialWorkflowCalls));
    expect(pregnancyPostCalls).toBe(0);
  }, 30000);
});

const PREGNANCY_1 = 'pregnancy-1';

// Reentrada con las dos ramas y el bloque de embarazo ya creados, más una complicación activa —
// el escenario que dispara la derivación de §6.5. Devuelve los cuerpos capturados de los dos
// `PUT` para que cada test compruebe lo que de verdad viaja al guardar.
function mockDerivationScenario(complicationCount: 0 | 1) {
  let severePutBody: Record<string, unknown> | null = null;
  let pregnancyPutBody: Record<string, unknown> | null = null;
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
    ),
    http.put(`http://localhost:4500/api/notifications/${NOTIFICATION_1}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
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
          updatedAt: '2026-01-03T00:00:00.000Z',
          deletedAt: null,
          appDetails: [],
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
          outcome: null,
        },
      });
    }),
    http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: SEVERE_NOTIFICATION_1,
          hasPreviousEventHistory: null,
          hasAllergyToOtherVaccines: null,
          hasAllergyToMedications: null,
          hasAllergyToPreviousSameVaccine: null,
          hasPregnancyComplications: null,
          pregnancyComplicationsDescription: null,
          notes: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          notification: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            isActive: true,
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
          },
        },
      }),
    ),
    http.put(`http://localhost:4500/api/severe-notifications/${SEVERE_NOTIFICATION_1}`, async ({ request }) => {
      severePutBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true, message: 'ok', data: { notificationId: SEVERE_NOTIFICATION_1 } });
    }),
    http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          pregnancyId: PREGNANCY_1,
          notificationId: NOTIFICATION_1,
          wasPregnantAtVaccination: 'YES',
          wasPregnantAtEsavi: null,
          lastMenstruationDate: null,
          probableDeliveryDate: null,
          // La incoherencia de §6.5 en su propia base: `'NO'` con una fila cargada — dura lo que
          // tarda el próximo clic en «Guardar».
          hasComplications: 'NO',
          notes: null,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
    http.put(`http://localhost:4500/api/notification-pregnancies/${PREGNANCY_1}`, async ({ request }) => {
      pregnancyPutBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true, message: 'ok', data: { pregnancyId: PREGNANCY_1 } });
    }),
    http.get(`http://localhost:4500/api/notification-pregnancy-complications/pregnancy/${PREGNANCY_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: complicationCount,
          rows:
            complicationCount === 1
              ? [
                  {
                    complicationId: 'complication-1',
                    pregnancyId: PREGNANCY_1,
                    diagnosticTermId: null,
                    complicationTypeItemId: 'complication-type-1',
                    complicationRawName: 'Preeclampsia',
                    sortOrder: 1,
                    notes: null,
                    isActive: true,
                    createdAt: '2026-01-02T00:00:00.000Z',
                    updatedAt: null,
                    deletedAt: null,
                    appDetails: [],
                    diagnosticTerm: null,
                    complicationType: null,
                  },
                ]
              : [],
        },
      }),
    ),
  );
  return {
    getSeverePutBody: () => severePutBody,
    getPregnancyPutBody: () => pregnancyPutBody,
  };
}

describe('NotificationStep — el GET del bloque de embarazo falla (SPEC FE12d §4 paso 14)', () => {
  it('muestra un banner de error con reintento, en vez de pintar el bloque vacío en silencio', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockNotificationDetail();

    let pregnancyGetCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: SEVERE_NOTIFICATION_1,
            hasPreviousEventHistory: null,
            hasAllergyToOtherVaccines: null,
            hasAllergyToMedications: null,
            hasAllergyToPreviousSameVaccine: null,
            hasPregnancyComplications: null,
            pregnancyComplicationsDescription: null,
            notes: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            notification: {
              notificationId: NOTIFICATION_1,
              notificationType: 'SEVERE',
              esaviDescription: 'Reacción local en el sitio de aplicación',
              isActive: true,
              case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
            },
          },
        }),
      ),
      http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () => {
        pregnancyGetCalls++;
        if (pregnancyGetCalls === 1) {
          return HttpResponse.json(
            { ok: false, message: 'error inesperado', code: 'UNKNOWN_ERROR' },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        );
      }),
    );

    renderNotificationStep();

    await screen.findByLabelText('Descripción del ESAVI (signos y síntomas)');
    expect(await screen.findByText('No pudimos cargar el bloque de embarazo.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(pregnancyGetCalls).toBe(2));
    await waitFor(() =>
      expect(screen.queryByText('No pudimos cargar el bloque de embarazo.')).not.toBeInTheDocument(),
    );
    // El 404 de reintento resuelve como «sin fila todavía» (§3.6), así que los campos del bloque
    // vuelven a aparecer en vez de quedarse en el banner.
    expect(
      await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' }),
    ).toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — la derivación de §6.5 (SPEC FE12d §4 paso 11)', () => {
  it('con ≥1 complicación activa, los dos campos se muestran «Sí» bloqueados y así viajan en el guardado normal, sin PUT propio', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockNotificationDetail();
    const { getSeverePutBody, getPregnancyPutBody } = mockDerivationScenario(1);

    renderNotificationStep();

    const pregnancyField = await screen.findByRole('combobox', {
      name: '¿Tuvo complicaciones el embarazo?',
    });
    const severeField = await screen.findByRole('combobox', {
      name: '¿Tuvo complicaciones el embarazo?',
    });

    // Bloqueados en «Sí», con la explicación compartida por los dos campos (§3.8) — ningún PUT se
    // ha disparado todavía por esto solo, sólo la lectura de las tres consultas.
    await waitFor(() => expect(pregnancyField).toHaveTextContent('Sí'));
    expect(severeField).toHaveTextContent('Sí');
    expect(pregnancyField).toBeDisabled();
    expect(severeField).toBeDisabled();
    expect(
      screen.getAllByText('Hay al menos una complicación registrada: se responde «Sí» automáticamente.'),
    ).toHaveLength(2);

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(getSeverePutBody()).not.toBeNull());
    expect(getSeverePutBody()).toMatchObject({ hasPregnancyComplications: 'YES' });
    await waitFor(() => expect(getPregnancyPutBody()).not.toBeNull());
    expect(getPregnancyPutBody()).toMatchObject({ hasComplications: 'YES' });
  }, 30000);

  it('sin ninguna complicación activa, los dos campos vuelven a ser editables sin recargar', async () => {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockNotificationDetail();
    mockDerivationScenario(0);

    renderNotificationStep();

    const pregnancyField = await screen.findByRole('combobox', {
      name: '¿Tuvo complicaciones el embarazo?',
    });
    const severeField = await screen.findByRole('combobox', {
      name: '¿Tuvo complicaciones el embarazo?',
    });

    await waitFor(() => expect(pregnancyField).toBeEnabled());
    expect(severeField).toBeEnabled();
    expect(
      screen.queryByText('Hay al menos una complicación registrada: se responde «Sí» automáticamente.'),
    ).not.toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — mapeo de errores propios del bloque de embarazo (SPEC FE12d §4 paso 8, §3.5)', () => {
  function renderReadyToSubmit() {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockNotificationDetail();
    server.use(
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
      ),
      http.put(`http://localhost:4500/api/notifications/${NOTIFICATION_1}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: body.esaviDescription,
            hasRelevantMedicalHistory: null,
            takesMedication: null,
            requestInvestigation: false,
            deathDate: null,
            autopsyRequested: null,
            verbalAutopsyPerformed: null,
            notes: null,
            isActive: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
            deletedAt: null,
            appDetails: [],
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
            outcome: null,
          },
        });
      }),
    );
    mockSevereNotificationBranch();
    renderNotificationStep();
  }

  it('un 400 NOTIFPRG_001_PATIENT_NOT_FEMALE muestra el toast propio con el sexo registrado', async () => {
    const user = setupUser();
    renderReadyToSubmit();

    server.use(
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/notification-pregnancies', () =>
        HttpResponse.json(
          { ok: false, message: 'el paciente no es femenino', code: 'NOTIFPRG_001_PATIENT_NOT_FEMALE' },
          { status: 400 },
        ),
      ),
    );

    await user.click(
      await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'El paciente tiene registrado el sexo «FEMALE»: el bloque de embarazo exige un paciente femenino. Corrígelo en el paso 1 si es un error de captura.',
    );
  }, 30000);

  it('un 500 NOTIFPRG_001_SEX_CONFIG_MISSING se presenta con el mismo texto del bloque deshabilitado, no como fallo del servidor', async () => {
    const user = setupUser();
    renderReadyToSubmit();

    server.use(
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/notification-pregnancies', () =>
        HttpResponse.json(
          { ok: false, message: 'no configurado', code: 'NOTIFPRG_001_SEX_CONFIG_MISSING' },
          { status: 500 },
        ),
      ),
    );

    await user.click(
      await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'El registro de embarazo no está configurado en este despliegue. Pídelo a un administrador.',
    );
  }, 30000);

  it('un 409 NOTIFPRG_001_ALREADY_EXISTS muestra el aviso del SUPERADMIN y no reintenta ni ofrece crear otro bloque', async () => {
    const user = setupUser();
    renderReadyToSubmit();

    let pregnancyPostCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
      http.post('http://localhost:4500/api/notification-pregnancies', () => {
        pregnancyPostCalls++;
        return HttpResponse.json(
          { ok: false, message: 'ya existe', code: 'NOTIFPRG_001_ALREADY_EXISTS' },
          { status: 409 },
        );
      }),
    );

    await user.click(
      await screen.findByRole('combobox', { name: '¿Estaba embarazada al momento de la vacunación?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'Ya existe un bloque de embarazo retirado para esta notificación. Reactivarlo exige un superadministrador; no se puede crear uno nuevo.',
    );
    expect(pregnancyPostCalls).toBe(1);
    // Ni reintento automático (un solo `POST`) ni un botón que ofrezca crear otro bloque.
    expect(screen.queryByRole('button', { name: /crear otro/i })).not.toBeInTheDocument();
  }, 30000);
});

describe('NotificationStep — la sugerencia de la fecha de parto (SPEC FE12d §4 paso 12)', () => {
  function renderOpenGate() {
    mockCaseDetail();
    mockPatientDetail('FEMALE');
    mockFemaleSexItemConfig('sex-FEMALE');
    mockClassificationDetail(true, 30);
    mockEmptyCatalogTypes();
    mockWorkflow({ count: 0 });
    renderNotificationStep();
  }

  it('con el campo de parto vacío, informar la menstruación lo rellena a +280 días', async () => {
    renderOpenGate();

    const menstruationInput = await screen.findByLabelText('Fecha de la última menstruación');
    fireEvent.change(menstruationInput, { target: { value: '2026-01-01' } });

    const deliveryInput = await screen.findByLabelText('Registre la fecha probable de parto o fecha de nacimiento');
    await waitFor(() => expect(deliveryInput).toHaveValue('2026-10-08'));
  }, 30000);

  it('si el campo de parto conserva exactamente la sugerencia anterior, cambiar la menstruación la sustituye', async () => {
    renderOpenGate();

    const menstruationInput = await screen.findByLabelText('Fecha de la última menstruación');
    const deliveryInput = await screen.findByLabelText('Registre la fecha probable de parto o fecha de nacimiento');

    fireEvent.change(menstruationInput, { target: { value: '2026-01-01' } });
    await waitFor(() => expect(deliveryInput).toHaveValue('2026-10-08'));

    fireEvent.change(menstruationInput, { target: { value: '2026-02-01' } });
    await waitFor(() => expect(deliveryInput).toHaveValue('2026-11-08'));
  }, 30000);

  it('con el campo de parto tecleado a mano, cambiar la menstruación no lo toca', async () => {
    renderOpenGate();

    const menstruationInput = await screen.findByLabelText('Fecha de la última menstruación');
    const deliveryInput = await screen.findByLabelText('Registre la fecha probable de parto o fecha de nacimiento');

    fireEvent.change(menstruationInput, { target: { value: '2026-01-01' } });
    await waitFor(() => expect(deliveryInput).toHaveValue('2026-10-08'));

    // El usuario teclea una fecha propia, distinta de la sugerencia — deja de conservarla.
    fireEvent.change(deliveryInput, { target: { value: '2026-12-25' } });
    await waitFor(() => expect(deliveryInput).toHaveValue('2026-12-25'));

    fireEvent.change(menstruationInput, { target: { value: '2026-02-01' } });
    // Ninguna nueva sugerencia sustituye lo tecleado a mano — se le da tiempo al efecto a no
    // disparar antes de confirmar que el valor sigue siendo el mismo.
    await waitFor(() => expect(menstruationInput).toHaveValue('2026-02-01'));
    expect(deliveryInput).toHaveValue('2026-12-25');
  }, 30000);
});

const MEDICAL_HISTORY_ROW = {
  medicalHistoryId: 'medhist-1',
  notificationId: NOTIFICATION_1,
  diagnosticTermId: null,
  historyRaw: 'Diabetes mellitus',
  sortOrder: 1,
  notes: null,
  isActive: true,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  diagnosticTerm: null,
};

type GateFlags = {
  hasRelevantMedicalHistory?: string;
  hasPreviousEventHistory?: string;
  hasAllergyToOtherVaccines?: string;
};

// Reentrada de la rama grave con las banderas de la compuerta bajo control (SPEC FE12e §3.6).
// Como la compuerta se deriva en render de la query de antecedentes, el escenario sólo necesita
// fijar las banderas y las filas: no hay estado que sembrar.
function mockGateScenario(flags: GateFlags, histories: unknown[]) {
  mockCaseDetail();
  mockPatientDetail('MALE');
  mockClassificationDetail(true);
  mockEmptyCatalogTypes();
  mockMedicalHistories(histories);
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'SEVERE',
          esaviDescription: 'Reacción local en el sitio de aplicación',
          hasRelevantMedicalHistory: flags.hasRelevantMedicalHistory ?? 'NO',
          takesMedication: 'YES',
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
    http.get(`http://localhost:4500/api/severe-notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: SEVERE_NOTIFICATION_1,
          hasPreviousEventHistory: flags.hasPreviousEventHistory ?? 'NO',
          hasAllergyToOtherVaccines: flags.hasAllergyToOtherVaccines ?? 'NO',
          hasAllergyToMedications: 'NO',
          hasAllergyToPreviousSameVaccine: 'NO',
          hasPregnancyComplications: null,
          pregnancyComplicationsDescription: null,
          notes: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          notification: {
            notificationId: NOTIFICATION_1,
            notificationType: 'SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            isActive: true,
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
          },
        },
      }),
    ),
    http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// La misma reentrada en la rama no grave: la ficha que resuelve es `NSEVNOT-006` y en pantalla
// aparecen las dos secciones de vacunación que el paso 6 separó.
function mockNonSevereReentry(hasRelevantMedicalHistory: string, histories: unknown[]) {
  mockCaseDetail();
  mockPatientDetail('MALE');
  mockClassificationDetail(false);
  mockEmptyCatalogTypes();
  mockMedicalHistories(histories);
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowBody(true) }),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'NON_SEVERE',
          esaviDescription: 'Reacción local en el sitio de aplicación',
          hasRelevantMedicalHistory,
          takesMedication: 'YES',
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
    http.get(`http://localhost:4500/api/non-severe-notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NON_SEVERE_NOTIFICATION_1,
          vaccinationSiteItemId: null,
          vaccinationCenterAddress: null,
          vaccinationGeoLocationId: null,
          vaccinationHealthFacilityId: null,
          verifiedPhysicalDocument: null,
          verifiedElectronicRecord: null,
          verifiedVerbalReport: null,
          verifiedClinicalRecord: null,
          verifiedUnknown: null,
          verifiedOtherSource: null,
          otherSourceDescription: null,
          notes: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          vaccinationHealthFacility: null,
          notification: {
            notificationId: NOTIFICATION_1,
            notificationType: 'NON_SEVERE',
            esaviDescription: 'Reacción local en el sitio de aplicación',
            isActive: true,
            case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: '2026-01-15' },
          },
        },
      }),
    ),
    http.get(`http://localhost:4500/api/notification-events/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/geo-locations/roots', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

async function headingOrder() {
  await screen.findByRole('heading', { name: 'Desenlace' });
  return screen.getAllByRole('heading').map((node) => node.textContent);
}

describe('NotificationStep  — el orden del paso 4 (SPEC FE12e §4 paso 8)', () => {
  it('en rama grave, las secciones salen en el orden de ESAVI-FORM.md', async () => {
    mockGateScenario({ hasRelevantMedicalHistory: 'YES' }, []);

    renderNotificationStep();

    // Sin bloque de embarazo: el paciente es masculino y la compuerta de CASE-PROCESS.md §7.4 lo
    // deja fuera del DOM entero — su posición la cubren los tests de FE12d.
    expect(await headingOrder()).toEqual([
      'Antecedentes de la persona vacunada',
      'Antecedentes médicos',
      'Antecedentes farmacológicos',
      'Selección de vacunas',
      'Eventos adversos',
      'Descripción del ESAVI',
      'Desenlace',
    ]);
  }, 30000);

  it('en rama no grave, las dos secciones de vacunación quedan antes de las vacunas', async () => {
    mockNonSevereReentry('YES', []);

    renderNotificationStep();

    expect(await headingOrder()).toEqual([
      'Antecedentes de la persona vacunada',
      'Antecedentes médicos',
      'Antecedentes farmacológicos',
      'Antecedentes de vacunación o inmunización',
      '¿Cómo se verificó la información de la vacunación?',
      'Selección de vacunas',
      'Eventos adversos',
      'Descripción del ESAVI',
      'Desenlace',
    ]);
  }, 30000);
});

describe('NotificationStep  — la compuerta de antecedentes medicos (SPEC FE12e §4 paso 11)', () => {
  it('con las cinco banderas en «No» y sin filas, la sección no existe en el DOM', async () => {
    mockGateScenario({}, []);

    renderNotificationStep();

    await screen.findByRole('heading', { name: 'Desenlace' });
    expect(screen.queryByRole('heading', { name: 'Antecedentes médicos' })).not.toBeInTheDocument();
  }, 30000);

  it('con una bandera en «Sí», la sección aparece', async () => {
    mockGateScenario({ hasAllergyToOtherVaccines: 'YES' }, []);

    renderNotificationStep();

    expect(await screen.findByRole('heading', { name: 'Antecedentes médicos' })).toBeInTheDocument();
  }, 30000);

  it('con dos banderas en «Sí» y filas cargadas, ninguna queda deshabilitada', async () => {
    signInAs('USER', 25);
    mockGateScenario(
      { hasRelevantMedicalHistory: 'YES', hasPreviousEventHistory: 'YES' },
      [MEDICAL_HISTORY_ROW],
    );

    renderNotificationStep();

    // La fila se pinta dos veces: la tabla de escritorio y la tarjeta de movil conviven en el
    // DOM y las oculta el CSS (`<SatelliteList>`, SPEC FE12b 3.7).
    await screen.findAllByText('Diabetes mellitus');
    expect(
      await screen.findByRole('combobox', {
        name: '¿El paciente presenta antecedentes médicos relevantes?',
      }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('combobox', {
        name: '¿Tiene antecedentes de eventos previos similares al actual?',
      }),
    ).not.toBeDisabled();
  }, 30000);

  it('al bajar una de las dos, la que queda en «Sí» se deshabilita y explica por qué', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockGateScenario(
      { hasRelevantMedicalHistory: 'YES', hasPreviousEventHistory: 'YES' },
      [MEDICAL_HISTORY_ROW],
    );

    renderNotificationStep();

    // La fila se pinta dos veces: la tabla de escritorio y la tarjeta de movil conviven en el
    // DOM y las oculta el CSS (`<SatelliteList>`, SPEC FE12b 3.7).
    await screen.findAllByText('Diabetes mellitus');
    const previousEventField = await screen.findByRole('combobox', {
      name: '¿Tiene antecedentes de eventos previos similares al actual?',
    });
    await user.click(previousEventField);
    await user.click(await screen.findByRole('option', { name: 'No' }));

    // La otra es ahora la única que sostiene las filas: es la única que se bloquea, y con el
    // texto de rol USER, que no puede retirarlas él mismo (§3.5).
    const relevantField = await screen.findByRole('combobox', {
      name: '¿El paciente presenta antecedentes médicos relevantes?',
    });
    await waitFor(() => expect(relevantField).toBeDisabled());
    expect(previousEventField).not.toBeDisabled();
    expect(await screen.findByText(/Hace falta un administrador para borrarlos/)).toBeInTheDocument();
  }, 30000);

  it('con filas y ninguna bandera en «Sí», la lista se muestra igual con el aviso de discrepancia', async () => {
    mockGateScenario({}, [MEDICAL_HISTORY_ROW]);

    renderNotificationStep();

    expect(await screen.findByRole('heading', { name: 'Antecedentes médicos' })).toBeInTheDocument();
    expect(
      await screen.findByText(/ninguna de estas respuestas dice que los haya/),
    ).toBeInTheDocument();
  }, 30000);

  it('en rama no grave, sólo hasRelevantMedicalHistory abre la compuerta', async () => {
    mockNonSevereReentry('NO', []);

    renderNotificationStep();

    await screen.findByRole('heading', { name: 'Desenlace' });
    // Las cuatro banderas de la ficha grave no existen en esta rama, así que no hay nada más que
    // pueda abrirla (SPEC FE12e §3.1, rama no grave).
    expect(screen.queryByRole('heading', { name: 'Antecedentes médicos' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', {
        name: '¿Tiene antecedentes de eventos previos similares al actual?',
      }),
    ).not.toBeInTheDocument();
  }, 30000);
});
