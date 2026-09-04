import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
import { ClassificationStep } from './ClassificationStep';

const server = setupServer();

const CASE_1 = 'case-1';
const PATIENT_1 = 'patient-1';
const CLASSIFICATION_1 = 'classification-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function mockCaseDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseId: CASE_1,
          caseCode: 'ESAVI-2026-0001',
          reportDate: null,
          // Non-null on purpose: with `patientDetail.birthDate` also set, the age mode resolves
          // to read-only and `<CatalogSelect typeCode="ageUnit">` never mounts — no need to mock
          // the catalog endpoints unless a test overrides one of the two dates (SPEC FE11 §3.5).
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
            lastNames: 'Perez',
            documentNumber: '0102030405',
            healthSystemCode: null,
          },
          healthFacility: { healthFacilityId: 'hfac-1', localCode: 'HF-01', name: 'Centro Norte' },
          ...overrides,
        },
      }),
    ),
  );
}

function mockPatientDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          patientId: PATIENT_1,
          names: 'Ana',
          lastNames: 'Perez',
          documentNumber: '0102030405',
          passportNumber: null,
          birthDate: '1990-05-20',
          healthSystemCode: null,
          email: null,
          phoneNumber: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          sex: null,
          residence: null,
          ...overrides,
        },
      }),
    ),
  );
}

function mockWorkflow(classificationExists: boolean) {
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
            classification: {
              exists: classificationExists,
              id: classificationExists ? CLASSIFICATION_1 : null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            notification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            finalClassification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
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

function mockClassificationDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: CLASSIFICATION_1,
          age: 35,
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
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null, eventDate: '2026-01-15' },
          ageUnit: { catalogItemId: 'ageunit-years', code: 'YEARS', name: 'Años', value: 'years' },
          ...overrides,
        },
      }),
    ),
  );
}

function mockAgeUnitCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogTypeId: 'cattype-ageunit',
              code: 'ageUnit',
              name: 'Unidad de edad',
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
    http.get('http://localhost:4500/api/catalog-items/type/cattype-ageunit', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogItemId: 'ageunit-years',
              catalogTypeId: 'cattype-ageunit',
              code: 'YEARS',
              name: 'Años',
              value: 'years',
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
  );
}

function renderClassificationStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/esavi-cases/${CASE_1}/wizard/classification`]}>
        <CaseWizardProvider>
          <ClassificationStep caseId={CASE_1} />
          <CaseWizardActionBar caseId={CASE_1} activeSlug="classification" />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function clickGate(user: ReturnType<typeof setupUser>, option: 'Sí' | 'No') {
  const gateGroup = await screen.findByRole('radiogroup', { name: '¿Es un evento grave?' });
  await user.click(within(gateGroup).getByRole('radio', { name: option }));
}

async function clickSaveButton(user: ReturnType<typeof setupUser>) {
  const saveButton = await screen.findByRole('button', { name: 'Guardar' });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await user.click(saveButton);
}

describe('ClassificationStep — alta sin datos previos (SPEC FE11 §3.4, §5)', () => {
  it('nace en blanco sin llamar a 006, y el POST no incluye age/ageUnitItemId en modo sólo lectura', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail();
    // `stages.classification.exists === false`: `useClassificationByCase` no debe dispararse — si
    // lo hiciera, el `onUnhandledRequest: 'error'` de MSW haría fallar el test, porque el 006
    // nunca se mockea aquí (SPEC FE11 §3.2, decisión §6).
    mockWorkflow(false);

    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/classifications', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { ok: true, message: 'ok', data: { ...receivedBody, classificationId: CLASSIFICATION_1 } },
          { status: 201 },
        );
      }),
    );

    renderClassificationStep();

    // Sin fila aún: la compuerta nace sin responder, sin ningún criterio visible.
    await screen.findByRole('radiogroup', { name: '¿Es un evento grave?' });
    expect(screen.queryByRole('radiogroup', { name: '¿Causó la muerte?' })).not.toBeInTheDocument();

    await clickGate(user, 'Sí');
    const causedDeathGroup = await screen.findByRole('radiogroup', { name: '¿Causó la muerte?' });
    await user.click(within(causedDeathGroup).getByRole('radio', { name: 'Sí' }));

    await clickSaveButton(user);

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({ isSeriousEvent: true, causedDeath: true, caseId: CASE_1 });
    expect(receivedBody).not.toHaveProperty('age');
    expect(receivedBody).not.toHaveProperty('ageUnitItemId');
  }, 30000);
});

describe('ClassificationStep — reentrada (SPEC FE11 §3.4, §5)', () => {
  it('con isSeriousEvent: true, la compuerta y el criterio ya marcado se precargan', async () => {
    mockCaseDetail();
    mockPatientDetail();
    mockWorkflow(true);
    mockClassificationDetail({ isSeriousEvent: true, causedDeath: true });

    renderClassificationStep();

    const gateGroup = await screen.findByRole('radiogroup', { name: '¿Es un evento grave?' });
    await waitFor(() => expect(within(gateGroup).getByRole('radio', { name: 'Sí' })).toBeChecked());

    const causedDeathGroup = screen.getByRole('radiogroup', { name: '¿Causó la muerte?' });
    expect(within(causedDeathGroup).getByRole('radio', { name: 'Sí' })).toBeChecked();
  }, 30000);
});

describe('ClassificationStep — bloqueo de guardado (SPEC FE11 §3.5, §5)', () => {
  it('con la compuerta en «Sí» y ningún criterio marcado, el envío se bloquea en el cliente', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail();
    mockWorkflow(false);
    // A propósito, ningún handler de POST /api/classifications: si el cliente llegara a
    // intentarlo, `onUnhandledRequest: 'error'` de MSW hace fallar el test.

    renderClassificationStep();

    await clickGate(user, 'Sí');
    await clickSaveButton(user);

    // El mismo texto también aparece en la lista de "campos pendientes" de
    // `CaseWizardActionBar` (SPEC FE08 §3.1) — `role="alert"` distingue el del grupo de
    // criterios (SPEC FE11 §3.6), que es lo que este test verifica.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Marca al menos un criterio en «Sí» si el evento es grave.',
    );
  }, 30000);
});

describe('ClassificationStep — compuerta Sí→No con criterios marcados (SPEC FE11 §3.5, §6)', () => {
  it('cancelar no toca los criterios; confirmar los limpia y oculta la sección', async () => {
    const user = setupUser();
    mockCaseDetail();
    mockPatientDetail();
    mockWorkflow(true);
    mockClassificationDetail({ isSeriousEvent: true, causedDeath: true });

    renderClassificationStep();

    const gateGroup = await screen.findByRole('radiogroup', { name: '¿Es un evento grave?' });
    await waitFor(() => expect(within(gateGroup).getByRole('radio', { name: 'Sí' })).toBeChecked());

    // Cancelar: el diálogo se cierra y no cambia nada.
    await user.click(within(gateGroup).getByRole('radio', { name: 'No' }));
    await screen.findByText('¿Cambiar a «No»?');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('¿Cambiar a «No»?')).not.toBeInTheDocument());
    expect(within(gateGroup).getByRole('radio', { name: 'Sí' })).toBeChecked();
    const causedDeathGroupStillThere = screen.getByRole('radiogroup', { name: '¿Causó la muerte?' });
    expect(within(causedDeathGroupStillThere).getByRole('radio', { name: 'Sí' })).toBeChecked();

    // Confirmar: limpia los ocho criterios y oculta la sección.
    await user.click(within(gateGroup).getByRole('radio', { name: 'No' }));
    await screen.findByText('¿Cambiar a «No»?');
    await user.click(screen.getByRole('button', { name: 'No' }));

    await waitFor(() =>
      expect(screen.queryByRole('radiogroup', { name: '¿Causó la muerte?' })).not.toBeInTheDocument(),
    );
    expect(within(gateGroup).getByRole('radio', { name: 'No' })).toBeChecked();
  }, 30000);
});

describe('ClassificationStep — modo de la edad (SPEC FE11 §3.5, §4)', () => {
  it('con birthDate y eventDate presentes, la edad es de sólo lectura y no monta el CatalogSelect', async () => {
    mockCaseDetail();
    mockPatientDetail();
    mockWorkflow(false);
    // Sin mocks de /catalog-types ni /catalog-items/type/...: si `<CatalogSelect>` llegara a
    // montarse, esas peticiones sin mock harían fallar el test (SPEC FE11 §4 paso 4).

    renderClassificationStep();

    await screen.findByText('Calculada automáticamente a partir de la fecha de nacimiento del paciente y la fecha del evento.');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Unidad' })).not.toBeInTheDocument();
  }, 30000);

  it('con birthDate ausente, la edad es editable (Input + CatalogSelect)', async () => {
    mockCaseDetail();
    mockPatientDetail({ birthDate: null });
    mockWorkflow(false);
    mockAgeUnitCatalog();

    renderClassificationStep();

    expect(await screen.findByRole('spinbutton', { name: 'Edad' })).toBeInTheDocument();
    // `<CatalogSelect>` resuelve `typeCode → catalogTypeId` con su propia query antes de pintar
    // el combobox — pinta un skeleton mientras tanto (CatalogSelect.tsx), de ahí `findByRole`.
    expect(await screen.findByRole('combobox', { name: 'Unidad' })).toBeInTheDocument();
  }, 30000);
});
