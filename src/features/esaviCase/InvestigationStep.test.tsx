import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnswerOption } from '@/contracts/common';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useDraftsStore } from '@/shared/stores/draftsStore';
import { CaseWizardProvider } from './CaseWizardContext';
import { InvestigationStep } from './InvestigationStep';

const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// Leaflet manipulates the real DOM with layout measurements jsdom doesn't compute — same minimal
// double as `MapPointPicker.test.tsx` and `BasicInfoSection.test.tsx`: here `<BasicInfoSection>`
// really mounts as soon as section 2 is visible.
vi.mock('leaflet', () => {
  class FakeHandler {
    enable() {}
    disable() {}
  }
  class FakeMarker {
    dragging = new FakeHandler();
    addTo() {
      return this;
    }
    on() {
      return this;
    }
    setLatLng() {}
    getLatLng() {
      return { lat: 0, lng: 0 };
    }
    remove() {}
  }
  class FakeTileLayer {
    addTo() {
      return this;
    }
  }
  class FakeMap {
    dragging = new FakeHandler();
    doubleClickZoom = new FakeHandler();
    scrollWheelZoom = new FakeHandler();
    boxZoom = new FakeHandler();
    keyboard = new FakeHandler();
    touchZoom = new FakeHandler();
    on() {
      return this;
    }
    panTo() {}
    remove() {}
  }
  return {
    default: {
      map: vi.fn(() => new FakeMap()),
      tileLayer: vi.fn(() => new FakeTileLayer()),
      marker: vi.fn(() => new FakeMarker()),
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    },
  };
});

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';
const NOTIFICATION_1 = 'notification-1';
const PATIENT_1 = 'patient-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

// Reset before every test (§4 paso 5's own opening `POST`): `null` until a test's own flow
// creates it, exactly like `teamRows` further down for the team satellite.
function emptyMedicalHistoryDetail() {
  return {
    investigationId: INVESTIGATION_1,
    investigation: { investigationId: INVESTIGATION_1, isActive: true },
    hasPriorHospitalizationHistory: null,
    priorHospitalizationObservations: null,
    hasFamilyHistory: null,
    familyHistoryObservations: null,
    isPregnancyConfirmed: null as AnswerOption | null,
    gestationalWeeks: null as number | null,
    gestationMethodItemId: null,
    deliveryItemId: null,
    birthItemId: null,
    pregnancyOutcomeItemId: null as string | null,
    hasPregnancyRiskFactor: null,
    riskFactorDescription: null,
    birthWeightGrams: null,
    wasBreastfed: null,
    notes: null,
    gestationMethod: null,
    delivery: null,
    birth: null,
    pregnancyOutcome: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}
let medicalHistoryRow: ReturnType<typeof emptyMedicalHistoryDetail> | null = null;

// Same reset-before-every-test criterion as `medicalHistoryRow` above, for section C's own
// 1:1 ficha (SPEC FE13c §4 paso 8): `null` until `ClinicalEvaluationSection`'s own opening `POST`
// creates it.
function emptyClinicalEvaluationDetail() {
  return {
    investigationId: INVESTIGATION_1,
    receivedMedicalAttention: null as AnswerOption | null,
    sourceExam: null,
    sourceDocuments: null,
    sourceVerbalAutopsy: null,
    sourceOther: null,
    otherDescription: null,
    suspectedChildAbuse: null,
    childAbuseExplanation: null,
    suspectedDomesticViolence: null,
    domesticViolenceExplanation: null,
    clinicalDetailsPersonName: null,
    familyClinicalDetails: null,
    completeClinicalSummary: null,
    signsAndSymptoms: null,
    otherSocialBackground: null,
    notes: null as string | null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}
let clinicalEvaluationRow: ReturnType<typeof emptyClinicalEvaluationDetail> | null = null;

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  toastInfo.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  medicalHistoryRow = null;
  clinicalEvaluationRow = null;
  mockSectionDependencies();
});

// Everything the three sections touch once they really mount, regardless of what each test
// wants to check about the header — same criterion as `mockEmptyCatalogAndSearch` in
// `BasicInfoSection.test.tsx`: empty by default, so as not to pollute the output with "unhandled
// request" when none of these routes are what the test examines.
function mockSectionDependencies() {
  server.use(
    http.get(`http://localhost:4500/api/investigation-sources/case/${CASE_1}`, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'INVSRC_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    http.get(`http://localhost:4500/api/investigation-autopsies/case/${CASE_1}`, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'INVAUT_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    // Stateful, unlike the two above (SPEC FE13b §4 paso 5): the section opens the ficha itself
    // with an empty `POST` as soon as it reveals, and the very next re-read has to see it, or
    // the section is stuck disabled forever waiting for a row that "exists" only on the server's
    // side of a mock that never remembers it.
    http.get(`http://localhost:4500/api/investigation-medical-histories/case/${CASE_1}`, () =>
      medicalHistoryRow
        ? HttpResponse.json({ ok: true, message: 'ok', data: medicalHistoryRow })
        : HttpResponse.json(
            { ok: false, message: 'no encontrado', code: 'INVMEDH_006_NOT_FOUND' },
            { status: 404 },
          ),
    ),
    http.post('http://localhost:4500/api/investigation-medical-histories', () => {
      medicalHistoryRow = emptyMedicalHistoryDetail();
      return HttpResponse.json({ ok: true, message: 'ok', data: medicalHistoryRow });
    }),
    http.put(`http://localhost:4500/api/investigation-medical-histories/${INVESTIGATION_1}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      medicalHistoryRow = { ...emptyMedicalHistoryDetail(), ...medicalHistoryRow, ...body };
      return HttpResponse.json({ ok: true, message: 'ok', data: medicalHistoryRow });
    }),
    // Section C (SPEC FE13c §4 paso 8): fetched unconditionally as soon as the header exists, the
    // same reason `medicalHistoryRow` above is stateful — `ClinicalEvaluationSection` opens its own
    // ficha the moment it reveals, and the very next re-read has to see it.
    http.get(`http://localhost:4500/api/investigation-clinical-evaluations/case/${CASE_1}`, () =>
      clinicalEvaluationRow
        ? HttpResponse.json({ ok: true, message: 'ok', data: clinicalEvaluationRow })
        : HttpResponse.json(
            { ok: false, message: 'no encontrado', code: 'INVCLIEV_006_NOT_FOUND' },
            { status: 404 },
          ),
    ),
    http.post('http://localhost:4500/api/investigation-clinical-evaluations', () => {
      clinicalEvaluationRow = emptyClinicalEvaluationDetail();
      return HttpResponse.json({ ok: true, message: 'ok', data: clinicalEvaluationRow }, { status: 201 });
    }),
    http.put(
      `http://localhost:4500/api/investigation-clinical-evaluations/${INVESTIGATION_1}`,
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        clinicalEvaluationRow = { ...emptyClinicalEvaluationDetail(), ...clinicalEvaluationRow, ...body };
        return HttpResponse.json({ ok: true, message: 'ok', data: clinicalEvaluationRow });
      },
    ),
    http.get(
      `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`http://localhost:4500/api/investigation-diagnostics/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    // The gate of §7.4 (SPEC FE13b §4 paso 6): a male patient by default so `pregnancyGate`
    // resolves to `'hidden'` and every test written before this section existed keeps seeing
    // exactly the four sections it always saw, without asserting anything about B1.
    http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', () =>
      HttpResponse.json(
        { ok: false, message: 'no configurado', code: 'SYSCONF_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: 'classification-1',
          age: 30,
          firstConsultationDate: null,
          isSeriousEvent: null,
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
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01', eventDate: '2026-01-15' },
          ageUnit: null,
        },
      }),
    ),
    http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseId: CASE_1,
          caseCode: 'ESAVI-2026-0001',
          reportDate: '2026-01-01',
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
            patientId: PATIENT_1,
            names: 'Ana',
            lastNames: 'Pérez',
            documentNumber: '0102030405',
            healthSystemCode: null,
          },
          healthFacility: { healthFacilityId: 'facility-1', localCode: 'F1', name: 'Hospital 1' },
        },
      }),
    ),
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          patientId: PATIENT_1,
          names: 'Ana',
          lastNames: 'Pérez',
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
          sex: { catalogItemId: 'sex-male', code: 'MALE', name: 'Masculino', value: 'MALE' },
          residence: null,
        },
      }),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'NON_SEVERE',
          deathDate: null,
          outcome: null,
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01', eventDate: null },
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
    http.get(
      `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/health-facilities/search', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(/\/api\/geo-locations\/.+/, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'GEOLOC_003_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

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

function investigationDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    ...overrides,
  };
}

// The workflow as seen by the header `POST`'s own invalidation on success: `investigation.exists`
// flips to `true` as soon as `postCount` rises, without waiting for a second mock per test —
// same mechanism as the first "empty but alive" test, extracted for reuse in the progressive
// reveal.
function mockWorkflowDynamic(getInvestigationExists: () => boolean) {
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
              exists: getInvestigationExists(),
              id: getInvestigationExists() ? INVESTIGATION_1 : null,
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

function mockWorkflowClosed() {
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: CASE_1,
          status: { catalogItemId: 'status-closed', code: 'CLOSED', name: 'Cerrado' },
          previousStatus: null,
          openedAt: '2026-01-01T00:00:00.000Z',
          closedAt: '2026-02-01T00:00:00.000Z',
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
            notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
            investigation: { exists: true, id: INVESTIGATION_1, startedAt: null, endedAt: null, durationMinutes: null },
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

const INVESTIGATION_STATUS_TYPE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STATUS_DEATH = '11111111-1111-4111-8111-111111111111';
const STATUS_RECOVERED = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

// Real `investigationStatus` catalog with a `DEATH` and a non-`DEATH` item — the death block's
// gate needs a real item behind `<CatalogSelect>`, same reasoning as `BasicInfoSection.test.tsx`.
function mockInvestigationStatusCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            { catalogTypeId: INVESTIGATION_STATUS_TYPE, code: 'investigationStatus', name: 'Estado' },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${INVESTIGATION_STATUS_TYPE}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            { catalogItemId: STATUS_DEATH, code: 'DEATH', name: 'Fallecido', value: 'DEATH' },
            { catalogItemId: STATUS_RECOVERED, code: 'RECOVERED', name: 'Recuperado', value: 'RECOVERED' },
          ],
        },
      }),
    ),
  );
}

function mockInvestigationDetail(overrides: Partial<Record<string, unknown>> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/investigations/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail(overrides) }),
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
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
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

    // Stays at 1 even if the workflow refreshes and confirms `exists:true` (the invalidation
    // the `POST` itself triggers on success).
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
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
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
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
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

describe('InvestigationStep — revelado progresivo y borrador (SPEC FE13a §4 paso 11)', () => {
  it('en un paso nuevo sólo se ve la sección 1, con un botón, y no las otras dos', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
    );

    renderInvestigationStep();

    expect(await screen.findByText('Fuentes de información')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Guardar y continuar' }),
    ).toBeInTheDocument();
    // Only one button — nothing from section 2 or 3 yet.
    expect(screen.getAllByRole('button', { name: 'Guardar y continuar' })).toHaveLength(1);
    expect(screen.queryByText('Información básica')).not.toBeInTheDocument();
    expect(screen.queryByText('Datos del equipo de investigación')).not.toBeInTheDocument();
  });

  it('al reentrar en un paso que ya existía se ven las tres secciones y ningún botón intermedio', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();

    renderInvestigationStep();

    expect(await screen.findByText('Fuentes de información')).toBeInTheDocument();
    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    // Nothing intermediate: on re-entry, `CaseWizardActionBar` is in charge, not a section button.
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
  });

  it('un borrador más viejo que el updatedAt de la cabecera se descarta con aviso', async () => {
    mockWorkflow(true);
    mockInvestigationDetail({ updatedAt: '2026-02-01T00:00:00.000Z' });
    // The draft's `baseUpdatedAt` doesn't match the row's real `updatedAt` — `resolveDraftConflict`'s
    // conflict rule discards it (SPEC FE12a §3.4).
    useDraftsStore.getState().set(CASE_1, 'investigation', { source: { other: true } }, '2026-01-01T00:00:00.000Z');

    renderInvestigationStep();

    await screen.findByText('Fuentes de información');
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith(
        'Se descartaron cambios sin guardar: el caso se editó en otro sitio.',
      ),
    );
    expect(useDraftsStore.getState().get(CASE_1, 'investigation')).toBeUndefined();
  });

  it('un borrador cuyo updatedAt coincide se restaura y avisa, sin bloquear el guardado', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    useDraftsStore.getState().set(
      CASE_1,
      'investigation',
      { source: { other: true, otherDescription: 'Fuente comunitaria' } },
      null,
    );

    renderInvestigationStep();

    expect(await screen.findByLabelText('Especifique ¿cuál?')).toHaveValue('Fuente comunitaria');
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith('Se recuperaron cambios sin guardar de una sesión anterior.'),
    );
  });
});

describe('InvestigationStep — el recorrido completo (SPEC FE13a §4 paso 13)', () => {
  it('alta desde cero: crea la cabecera, guarda las tres secciones y añade un miembro del equipo', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    let teamRows: Record<string, unknown>[] = [];
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { investigationId: INVESTIGATION_1, history: true },
        }),
      ),
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: teamRows.length, rows: teamRows } }),
      ),
      http.post('http://localhost:4500/api/investigation-team-members', async ({ request }) => {
        await request.json();
        const created = {
          investigationTeamMemberId: 'member-1',
          fullName: 'Ana Pérez',
          institutionName: null,
          email: null,
          phone: null,
          notes: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        };
        teamRows = [created];
        return HttpResponse.json({ ok: true, message: 'ok', data: created });
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));

    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));

    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    // `team` never gates anything and passes through on its own (SPEC FE13b §4 paso 5); what's
    // left with a button now is `medicalHistory`, revealed right behind it — disabled until its
    // opening `POST` resolves.
    expect(
      await screen.findByRole('heading', { name: 'Antecedentes de la persona vacunada' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await user.type(screen.getByLabelText('Nombres y apellidos'), 'Ana Pérez');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByText('Ana Pérez')).length).toBeGreaterThan(0);
  });

  it('reentrada: las tres secciones muestran los datos ya guardados', async () => {
    mockWorkflow(true);
    mockInvestigationDetail({ notes: 'Notas previas' });
    server.use(
      http.get(`http://localhost:4500/api/investigation-sources/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            investigationId: INVESTIGATION_1,
            history: true,
            interviewVaccinatedPerson: null,
            interviewHealthWorker: null,
            vaccinationRecord: null,
            autopsyRecord: null,
            verbalAutopsyRecord: null,
            investigationReport: null,
            other: null,
            otherDescription: null,
            notes: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
          },
        }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 1,
              rows: [
                {
                  investigationTeamMemberId: 'member-1',
                  fullName: 'Ana Pérez',
                  institutionName: 'MINSAL',
                  email: null,
                  phone: null,
                  notes: null,
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
    );

    renderInvestigationStep();

    expect(await screen.findByRole('switch', { name: 'Historia clínica' })).toBeChecked();
    await screen.findByText('Información básica');
    await waitFor(() =>
      expect(document.getElementById('investigation-basicInfo-notes')).toHaveValue('Notas previas'),
    );
    expect((await screen.findAllByText('Ana Pérez')).length).toBeGreaterThan(0);
    // Full reveal on reentry means no frontier at all (SPEC FE13a §3.6, unchanged by this spec):
    // `medicalHistory` opens its ficha silently in the background same as the other three
    // sections show without one — none of the four gets a "Guardar y continuar" here.
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
  });

  it('cambiar el estado a muerte y volver a otro antes de guardar no crea la fila de autopsia', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    mockInvestigationStatusCatalog();
    let investigationSourcePut = false;
    let investigationPutBody: Record<string, unknown> | null = null;
    let autopsyPostCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () => {
        investigationSourcePut = true;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { investigationId: INVESTIGATION_1, history: null },
        });
      }),
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, async ({ request }) => {
        investigationPutBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: investigationDetail({ status: { catalogItemId: STATUS_RECOVERED, code: 'RECOVERED', name: 'Recuperado' } }),
        });
      }),
      http.post('http://localhost:4500/api/investigation-autopsies', () => {
        autopsyPostCount++;
        return HttpResponse.json(
          { ok: false, message: 'no debería llamarse', code: 'UNKNOWN_ERROR' },
          { status: 500 },
        );
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));
    await waitFor(() => expect(investigationSourcePut).toBe(true));

    expect(await screen.findByText('Información básica')).toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: 'Estado de la persona al momento de la investigación' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));
    expect(
      await screen.findByLabelText('Si la persona murió, indique la fecha de la muerte'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: 'Estado de la persona al momento de la investigación' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Recuperado' }));
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Si la persona murió, indique la fecha de la muerte'),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(investigationPutBody).not.toBeNull());
    expect(investigationPutBody).toMatchObject({ statusItemId: STATUS_RECOVERED });
    expect(autopsyPostCount).toBe(0);
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
  });

  it('fallo de guardado: un error en la sección 1 no avanza, y un reintento sí', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    let attempt = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () => {
        attempt++;
        if (attempt === 1) {
          return HttpResponse.json(
            { ok: false, message: 'Error inesperado', code: 'UNKNOWN_ERROR' },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { investigationId: INVESTIGATION_1, history: true },
        });
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByText('Información básica')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it('expediente CLOSED: las tres secciones se ven pero deshabilitadas, sin botones de guardar ni de añadir', async () => {
    mockWorkflowClosed();
    mockInvestigationDetail();

    renderInvestigationStep();

    expect(await screen.findByText('Fuentes de información')).toBeInTheDocument();
    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Historia clínica' })).toBeDisabled();
  });
});

describe('InvestigationStep — sección C: evaluación clínica, instituciones y diagnósticos (SPEC FE13c §4 paso 8)', () => {
  it('en un paso nuevo, tras revelar todo lo anterior, sólo se ve la evaluación clínica con un botón', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { investigationId: INVESTIGATION_1, history: true } }),
      ),
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
      ),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));
    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    // `team` passes through on its own (SPEC FE13b §4 paso 5); `medicalHistory` opens its own
    // ficha and is the next section with a button.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect((await screen.findAllByText('Detalles de la primera evaluación clínica del ESAVI')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: 'Guardar y continuar' })).toBeInTheDocument();
    // Only one button — nothing from the institutions or diagnostics identifiers yet.
    expect(screen.getAllByRole('button', { name: 'Guardar y continuar' })).toHaveLength(1);
    expect(screen.queryByText('Instituciones que evaluaron al paciente')).not.toBeInTheDocument();
    expect(screen.queryByText('Diagnóstico final o presuntivo')).not.toBeInTheDocument();
  }, 30000);

  it('reentrada con todo revelado: las tres secciones se ven y ningún botón intermedio', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    clinicalEvaluationRow = {
      ...emptyClinicalEvaluationDetail(),
      receivedMedicalAttention: 'YES',
    };

    renderInvestigationStep();

    expect((await screen.findAllByText('Detalles de la primera evaluación clínica del ESAVI')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Instituciones que evaluaron al paciente')).toBeInTheDocument();
    expect(await screen.findByText('Diagnóstico final o presuntivo')).toBeInTheDocument();
    // Nothing intermediate: on re-entry, `CaseWizardActionBar` is in charge, not a section button.
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });

  it('expediente CLOSED: las tres secciones se ven en sólo lectura, sin «Guardar» ni «Añadir»', async () => {
    mockWorkflowClosed();
    mockInvestigationDetail();
    clinicalEvaluationRow = emptyClinicalEvaluationDetail();

    renderInvestigationStep();

    expect((await screen.findAllByText('Detalles de la primera evaluación clínica del ESAVI')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Instituciones que evaluaron al paciente')).toBeInTheDocument();
    expect(await screen.findByText('Diagnóstico final o presuntivo')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir institución' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir diagnóstico' })).not.toBeInTheDocument();
  });
});

// Los cuatro escenarios del recorrido de las tres secciones de embarazo (SPEC FE13b §4 paso 9):
// alta desde cero, reentrada con todo revelado, cambio de desenlace con condiciones cargadas, y
// expediente CLOSED. `mockSectionDependencies` deja al paciente MALE por defecto para no romper
// los tests de FE13a de arriba — estos cuatro lo pisan con una mujer en edad fértil (30 años el
// 2026-01-15, dentro de 15–49) para que la compuerta de §7.4 resuelva `visible`.
const OUTCOME_LIVE_WITH_CONDITION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OUTCOME_OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PREGNANCY_OUTCOME_TYPE = 'ffffffff-ffff-4fff-8fff-fffffffffff1';

function mockFemalePatient() {
  server.use(
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          patientId: PATIENT_1,
          names: 'Ana',
          lastNames: 'Pérez',
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
          sex: { catalogItemId: 'sex-female', code: 'FEMALE', name: 'Femenino', value: 'FEMALE' },
          residence: null,
        },
      }),
    ),
  );
}

function mockPregnancyOutcomeCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [{ catalogTypeId: PREGNANCY_OUTCOME_TYPE, code: 'pregnancyOutcome', name: 'Desenlace' }],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${PREGNANCY_OUTCOME_TYPE}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            {
              catalogItemId: OUTCOME_LIVE_WITH_CONDITION,
              code: 'LIVE_WITH_CONDITION',
              name: 'Nacido vivo con afección médica al nacer',
              value: '2',
            },
            { catalogItemId: OUTCOME_OTHER, code: 'OTHER', name: 'Otro', value: '1' },
          ],
        },
      }),
    ),
  );
}

// Datos ya guardados en las tres secciones de embarazo, para la reentrada y sus dos derivados
// (cambio de desenlace, CLOSED). `activeConditionsCount` decide cuántas filas trae B2.
function mockPregnancyReentryData(activeConditionsCount: number) {
  medicalHistoryRow = {
    ...emptyMedicalHistoryDetail(),
    isPregnancyConfirmed: 'YES',
    gestationalWeeks: 20,
    pregnancyOutcomeItemId: OUTCOME_LIVE_WITH_CONDITION,
  };
  server.use(
    http.get(`http://localhost:4500/api/investigation-sources/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          investigationId: INVESTIGATION_1,
          history: true,
          interviewVaccinatedPerson: null,
          interviewHealthWorker: null,
          vaccinationRecord: null,
          autopsyRecord: null,
          verbalAutopsyRecord: null,
          investigationReport: null,
          other: null,
          otherDescription: null,
          notes: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
    http.get(
      `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
      () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                investigationTeamMemberId: 'member-1',
                fullName: 'Ana Pérez',
                institutionName: 'MINSAL',
                email: null,
                phone: null,
                notes: null,
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
    http.get(
      `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
      () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: activeConditionsCount,
            rows: Array.from({ length: activeConditionsCount }, (_, index) => ({
              pregnancyConditionId: `condition-${index}`,
              investigationId: INVESTIGATION_1,
              diagnosticTermId: null,
              diagnosticTerm: null,
              conditionRaw: `Condición ${index}`,
              sortOrder: index,
              notes: null,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            })),
          },
        }),
    ),
  );
}

describe('InvestigationStep — recorrido de las tres secciones de embarazo (SPEC FE13b §4 paso 9)', () => {
  it('alta desde cero: revelar B1 con la mujer confirmada y el desenlace correcto revela B2', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    mockFemalePatient();
    mockPregnancyOutcomeCatalog();
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { investigationId: INVESTIGATION_1, history: true },
        }),
      ),
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));

    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    // `team` pasa de largo sin botón propio (§4 paso 5); lo que sigue con botón es `medicalHistory`.
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    // El bloque de embarazo se reveló porque el paciente es mujer en edad fértil (§7.4) —
    // `medicalHistory` era la última sección con botón antes de este spec, ahora es `pregnancy`.
    expect(await screen.findByRole('heading', { name: 'Preguntas para mujeres' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', {
        name: 'Confirme si la mujer estaba embarazada en el momento de la vacuna',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Sí' }));

    expect(
      screen.queryByRole('heading', { name: 'Afecciones médicas del recién nacido' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: '¿Cuál fue el desenlace del embarazo?' }),
    );
    await user.click(
      await screen.findByRole('option', { name: 'Nacido vivo con afección médica al nacer' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Afecciones médicas del recién nacido' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No se han registrado afecciones médicas del recién nacido.'),
    ).toBeInTheDocument();
  }, 60000);

  it('reentrada con todo revelado: las cinco secciones muestran sus datos, sin ningún botón intermedio', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    mockFemalePatient();
    mockPregnancyOutcomeCatalog();
    mockPregnancyReentryData(1);

    renderInvestigationStep();

    await screen.findByRole('switch', { name: 'Historia clínica' });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Historia clínica' })).toBeChecked(),
    );
    expect((await screen.findAllByText('Ana Pérez')).length).toBeGreaterThan(0);
    expect(
      await screen.findByRole('heading', { name: 'Afecciones médicas del recién nacido' }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Condición 0')).not.toHaveLength(0);
    // Revelado completo (§3.6, igual que las tres secciones de FE13a): ninguna de las cinco
    // secciones muestra «Guardar y continuar» en la reentrada.
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
  });

  it('cambio de desenlace con condiciones cargadas: no manda ninguna petición y abre el diálogo de bloqueo', async () => {
    // Deliberadamente NO es una reentrada (§3.6 no deja botón en ninguna sección una vez
    // `revealAll` es verdadero, así que no hay forma de volver a guardar B1 desde esta pantalla
    // una vez todo está revelado): la investigación sigue sin existir al montar —el mismo criterio
    // de «alta desde cero»—, pero la ficha de antecedentes y sus dos condiciones ya están
    // cargadas en el servidor, como si el investigador hubiera avanzado hasta aquí en una sesión
    // anterior y volviera ahora a terminar el paso.
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    mockInvestigationDetail();
    mockFemalePatient();
    mockPregnancyOutcomeCatalog();
    medicalHistoryRow = {
      ...emptyMedicalHistoryDetail(),
      isPregnancyConfirmed: 'YES',
      pregnancyOutcomeItemId: OUTCOME_LIVE_WITH_CONDITION,
    };
    let putCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.post('http://localhost:4500/api/investigation-sources', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { investigationId: INVESTIGATION_1, history: true },
        }),
      ),
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 2,
              rows: [0, 1].map((index) => ({
                pregnancyConditionId: `condition-${index}`,
                investigationId: INVESTIGATION_1,
                diagnosticTermId: null,
                diagnosticTerm: null,
                conditionRaw: `Condición ${index}`,
                sortOrder: index,
                notes: null,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: null,
                deletedAt: null,
                appDetails: [],
              })),
            },
          }),
      ),
      http.put(`http://localhost:4500/api/investigation-medical-histories/${INVESTIGATION_1}`, () => {
        putCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: medicalHistoryRow });
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));
    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeEnabled(),
    );
    // La ficha ya trae `isPregnancyConfirmed: 'YES'` — no hace falta tocar B, sólo avanzar. Ese
    // «Guardar y continuar» es de la sección B (`medicalHistory`), que escribe el mismo recurso
    // que B1 — de ahí que el conteo del bloqueo se tome a partir de aquí, no desde cero.
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    // Llegados a B1 con el desenlace ya en «Nacido vivo con afección médica al nacer» y sus dos
    // condiciones cargadas — visibles sin haber tocado nada.
    expect(
      await screen.findByRole('heading', { name: 'Afecciones médicas del recién nacido' }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Condición 0')).not.toHaveLength(0);
    const putCountBeforeBlock = putCount;

    await user.click(
      screen.getByRole('combobox', { name: '¿Cuál fue el desenlace del embarazo?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Otro' }));
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(
      await screen.findByRole('heading', { name: 'No se puede cambiar el desenlace' }),
    ).toBeInTheDocument();
    expect(putCount).toBe(putCountBeforeBlock);
  }, 60000);

  it('expediente CLOSED: las cinco secciones de embarazo se ven en sólo lectura, sin «Guardar» ni «Añadir afección»', async () => {
    mockWorkflowClosed();
    mockInvestigationDetail();
    mockFemalePatient();
    mockPregnancyOutcomeCatalog();
    mockPregnancyReentryData(1);

    renderInvestigationStep();

    expect(await screen.findByRole('heading', { name: 'Preguntas para mujeres' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Afecciones médicas del recién nacido' }),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir afección' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', {
        name: 'Confirme si la mujer estaba embarazada en el momento de la vacuna',
      }),
    ).toBeDisabled();
  });
});

// El recorrido completo del tramo C (SPEC FE13c §4 paso 10): alta desde cero, reentrada,
// apagado de una bandera con explicación escrita, 409 en las dos listas, y expediente CLOSED.
// La entrada a la sección C reutiliza exactamente los mismos cuatro clics que la primera prueba
// del paso 8 (fuentes → información básica → equipo → antecedentes) — factorizados aquí porque
// tres de las cinco pruebas la necesitan.
async function walkToClinicalEvaluation() {
  let postCount = 0;
  mockWorkflowDynamic(() => postCount > 0);
  mockInvestigationDetail();
  server.use(
    http.post('http://localhost:4500/api/investigations', () => {
      postCount++;
      return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
    }),
    http.post('http://localhost:4500/api/investigation-sources', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { investigationId: INVESTIGATION_1, history: true } }),
    ),
    http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
    ),
  );

  const user = setupUser();
  renderInvestigationStep();

  await waitFor(() => expect(postCount).toBe(1));
  await user.click(await screen.findByRole('button', { name: 'Guardar y continuar' }));
  expect(await screen.findByText('Información básica')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
  expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
  expect(
    (await screen.findAllByText('Detalles de la primera evaluación clínica del ESAVI')).length,
  ).toBeGreaterThan(0);

  return user;
}

describe('InvestigationStep — el recorrido completo del tramo C (SPEC FE13c §4 paso 10)', () => {
  it('alta desde cero: guarda la evaluación clínica y añade una institución evaluadora', async () => {
    const user = await walkToClinicalEvaluation();

    const institutionRows: Array<Record<string, unknown>> = [];
    server.use(
      http.get(
        `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: institutionRows.length, rows: institutionRows } }),
      ),
      http.post('http://localhost:4500/api/evaluation-institutions', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ investigationId: INVESTIGATION_1, institutionName: 'Clínica Norte' });
        const created = { evaluationInstitutionId: 'new-institution', ...body };
        institutionRows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    // Section C's own opening `POST` already fired inside `walkToClinicalEvaluation` (the ficha
    // is created the moment the section reveals, §4 paso 5). Saving here is the `PUT`.
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await waitFor(() => expect(clinicalEvaluationRow).not.toBeNull());

    // `evaluationInstitutions` is next, with its own bare "Siguiente" (§6 decisión 5, §4 paso 8) —
    // no save semantics of its own, it's a satellite list.
    expect(await screen.findByText('Instituciones que evaluaron al paciente')).toBeInTheDocument();
    expect(screen.queryByText('Diagnóstico final o presuntivo')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
    await user.type(
      await screen.findByLabelText('Nombre de la institución (si no está en el buscador)'),
      'Clínica Norte',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(institutionRows).toHaveLength(1));
    expect(await screen.findAllByText('Clínica Norte')).not.toHaveLength(0);

    // The last advance reveals diagnostics automatically, with no button of its own (§4 paso 8).
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Diagnóstico final o presuntivo')).toBeInTheDocument();
    expect(screen.getByText('No se han registrado diagnósticos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  }, 30000);

  it('reentrada: las tres secciones muestran los datos ya guardados', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    clinicalEvaluationRow = {
      ...emptyClinicalEvaluationDetail(),
      receivedMedicalAttention: 'YES',
      notes: 'Nota clínica de la evaluación',
    };
    server.use(
      http.get(
        `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 1,
              rows: [
                {
                  evaluationInstitutionId: 'institution-1',
                  investigationId: INVESTIGATION_1,
                  sortOrder: 1,
                  healthFacilityId: null,
                  institutionName: 'Clínica del Valle',
                  personName: null,
                  personContact: null,
                  evaluationInstitutionTypeItemId: null,
                  notes: null,
                  isActive: true,
                  healthFacility: null,
                  institutionType: null,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: null,
                  deletedAt: null,
                  appDetails: [],
                },
              ],
            },
          }),
      ),
      http.get(`http://localhost:4500/api/investigation-diagnostics/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                diagnosticId: 'diagnostic-1',
                investigationId: INVESTIGATION_1,
                sortOrder: 1,
                diagnosticTermId: 'term-1',
                diagnosticRaw: 'Fiebre alta persistente',
                diagnosticDate: null,
                diagnosticTypeItemId: null,
                notes: null,
                isActive: true,
                diagnosticTerm: { diagnosticTermId: 'term-1', name: 'Fiebre', code: 'F001', source: 'MEDDRA' },
                diagnosticType: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: null,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        }),
      ),
    );

    renderInvestigationStep();

    expect(await screen.findByDisplayValue('Nota clínica de la evaluación')).toBeInTheDocument();
    expect(await screen.findAllByText('Clínica del Valle')).not.toHaveLength(0);
    // `diagnosticRaw` is what's pinted, not `diagnosticTerm.name` (§3.5 C, §6 decisión 10).
    expect(await screen.findAllByText('Fiebre alta persistente')).not.toHaveLength(0);
    expect(screen.queryByText('Fiebre', { selector: 'td, span, p' })).not.toBeInTheDocument();
  });

  it('apagar sourceOther con una explicación ya escrita manda null explícito en el PUT', async () => {
    const user = await walkToClinicalEvaluation();

    // `SourceSection` (already revealed above) has its own "Otro" switch — this is
    // `ClinicalEvaluationSection`'s `sourceOther`, the last "Otro" switch in the DOM.
    const otherSwitches = screen.getAllByRole('switch', { name: 'Otro' });
    const clinicalEvaluationOtherSwitch = otherSwitches[otherSwitches.length - 1];
    await user.click(clinicalEvaluationOtherSwitch);
    await user.type(
      await screen.findByLabelText('¿Cuál?'),
      'Consulta con especialista externo',
    );
    // Apagarlo otra vez antes de guardar: la explicación ya escrita no debe viajar (§3.5 A, §7.3).
    await user.click(clinicalEvaluationOtherSwitch);
    expect(screen.queryByLabelText('¿Cuál?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(clinicalEvaluationRow).toMatchObject({ sourceOther: false, otherDescription: null });
  }, 30000);

  it('409 al añadir una institución duplicada deja el diálogo abierto con el error anclado en el buscador', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    clinicalEvaluationRow = emptyClinicalEvaluationDetail();
    server.use(
      http.post('http://localhost:4500/api/evaluation-institutions', () =>
        HttpResponse.json(
          { ok: false, message: 'Esta unidad de salud ya está en la lista.', code: 'EVALINST_001_ALREADY_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    const user = setupUser();
    renderInvestigationStep();

    await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
    await user.type(
      await screen.findByLabelText('Nombre de la institución (si no está en el buscador)'),
      'Clínica Norte',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Esta unidad de salud ya está en la lista.')).toBeInTheDocument();
    // Scoped to the dialog: reentry also reveals `BasicInfoSection`, which has its own field with
    // the same accessible name.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Unidad de salud')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    // El 409 de diagnóstico duplicado (INVDIAG_00X_ALREADY_EXISTS) ya está cubierto a nivel de
    // componente en `DiagnosticList.test.tsx` — reproducirlo aquí escribiría en
    // `<MeddraSearchField>` dentro del árbol completo de `InvestigationStep`, el disparador
    // confirmado del cuelgue de entorno documentado en el paso 7 (reproducido incluso en un test
    // preexistente sin tocar). No se duplica esa interacción en este archivo, más pesado de montar.
  });

  it('expediente CLOSED: las tres secciones nuevas son de sólo lectura', async () => {
    mockWorkflowClosed();
    mockInvestigationDetail();
    clinicalEvaluationRow = {
      ...emptyClinicalEvaluationDetail(),
      notes: 'Nota clínica de la evaluación',
    };
    server.use(
      http.get(
        `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
        () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 1,
              rows: [
                {
                  evaluationInstitutionId: 'institution-1',
                  investigationId: INVESTIGATION_1,
                  sortOrder: 1,
                  healthFacilityId: null,
                  institutionName: 'Clínica del Valle',
                  personName: null,
                  personContact: null,
                  evaluationInstitutionTypeItemId: null,
                  notes: null,
                  isActive: true,
                  healthFacility: null,
                  institutionType: null,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: null,
                  deletedAt: null,
                  appDetails: [],
                },
              ],
            },
          }),
      ),
    );

    renderInvestigationStep();

    expect(await screen.findByDisplayValue('Nota clínica de la evaluación')).toBeDisabled();
    expect(await screen.findAllByText('Clínica del Valle')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir institución' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir diagnóstico' })).not.toBeInTheDocument();
  });
});
