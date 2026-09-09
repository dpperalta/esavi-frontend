import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { PatientFormDialog } from './PatientFormDialog';

const server = setupServer();

const PATIENT_1 = '55555555-5555-4555-8555-555555555555';

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

function mockCatalogTypesEmpty() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockGeoLocationPickerEmpty() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_1,
    names: 'Ana',
    lastNames: 'Pérez',
    documentNumber: '1712345678',
    passportNumber: null,
    birthDate: null,
    healthSystemCode: 'HSC-0001',
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
  };
}

function mockPatientDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: makePatient(overrides) }),
    ),
  );
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PatientFormDialog open patientId={PATIENT_1} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('PatientFormDialog — casilla «sin documento» (SPEC FE10 §3.5, §8 paso 8)', () => {
  it('marcarla deshabilita el campo documento y lo rellena con un PROV-', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();

    renderDialog();

    const documentInput = await screen.findByLabelText('Número de documento');
    expect(documentInput).toBeEnabled();
    expect(documentInput).toHaveValue('1712345678');

    await user.click(screen.getByRole('checkbox', { name: 'No tiene documento de identidad' }));

    expect(documentInput).toBeDisabled();
    expect((documentInput as HTMLInputElement).value).toMatch(/^PROV-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});

describe('PatientFormDialog — mapeo de errores (SPEC FE10 §3.5)', () => {
  it('un 409 con PATIENT_004_GEOLOC_NOT_FOUND marca residenceGeoLocationId, no un toast', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();
    server.use(
      http.put(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'La ubicación de residencia no existe',
            code: 'PATIENT_004_GEOLOC_NOT_FOUND',
          },
          { status: 404 },
        ),
      ),
    );

    renderDialog();

    await screen.findByLabelText('Número de documento');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const fieldError = await screen.findByText('La ubicación de residencia no existe');
    // Mapped to the field (a `<FormMessage>`, `data-slot="form-message"`), never a generic toast —
    // no `<Toaster>` is even mounted in this render tree, so a toast would leave no trace at all.
    expect(fieldError.closest('[data-slot="form-message"]')).toBeInTheDocument();
  });
});

describe('PatientFormDialog — el error de una mutación no sobrevive al cierre (CONVENTIONS.md §10.7)', () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Reabrir
        </button>
        <PatientFormDialog open={open} patientId={PATIENT_1} onOpenChange={setOpen} />
      </>
    );
  }

  function renderHarness() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  }

  it('un 409 no reaparece al cerrar y reabrir el diálogo', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();
    server.use(
      http.put(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Ese documento ya está en uso', code: 'PATIENT_004_DOCUMENT_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await screen.findByLabelText('Número de documento');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ese documento ya está en uso')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('Ese documento ya está en uso')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await screen.findByLabelText('Número de documento');
    expect(screen.queryByText('Ese documento ya está en uso')).not.toBeInTheDocument();
  });
});

const USER_1 = '77777777-7777-4777-8777-777777777777';
const CASE_1 = '88888888-8888-4888-8888-888888888888';
const NOTIFICATION_1 = '99999999-9999-4999-8999-999999999999';
const PREGNANCY_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEX_TYPE_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEX_MALE_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SEX_FEMALE_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function signInAs(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: USER_1, roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function mockSexCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogTypeId: SEX_TYPE_1,
              code: 'sex',
              name: 'Sexo',
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
    http.get(`http://localhost:4500/api/catalog-items/type/${SEX_TYPE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            {
              catalogItemId: SEX_FEMALE_1,
              catalogTypeId: SEX_TYPE_1,
              code: 'FEMALE',
              name: 'Femenino',
              value: 'FEMALE',
              isValueLocked: true,
              description: null,
              sortOrder: 0,
              metadata: null,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
            {
              catalogItemId: SEX_MALE_1,
              catalogTypeId: SEX_TYPE_1,
              code: 'MALE',
              name: 'Masculino',
              value: 'MALE',
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

// Todo lo que `usePregnancyBlockGuard` pide al montar (SPEC FE12d §4 paso 13, §3.4): el paciente
// ya es mujer en edad fértil hoy (26 años el 2026-01-15) y el bloque de embarazo tiene datos
// cargados — el escenario que dispara el bloqueo. `complicationCount` decide si «Vaciar» queda
// disponible.
function mockPregnancyBlockScenario(complicationCount: 0 | 1) {
  let pregnancyRow: Record<string, unknown> | null = {
    pregnancyId: PREGNANCY_1,
    notificationId: NOTIFICATION_1,
    wasPregnantAtVaccination: 'NO',
    wasPregnantAtEsavi: null,
    lastMenstruationDate: null,
    probableDeliveryDate: null,
    hasComplications: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
  let pregnancyPutBody: Record<string, unknown> | null = null;
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', () =>
      HttpResponse.json(
        { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
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
          patient: { patientId: PATIENT_1, names: 'Ana', lastNames: 'Pérez', documentNumber: '1712345678' },
          healthFacility: { healthFacilityId: 'hfac-1', localCode: 'HF-01', name: 'Centro Norte' },
        },
      }),
    ),
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
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
              id: 'classification-1',
              startedAt: '2026-01-01T00:00:00.000Z',
              endedAt: '2026-01-01T00:00:00.000Z',
              durationMinutes: 5,
            },
            notification: {
              exists: true,
              id: NOTIFICATION_1,
              startedAt: '2026-01-02T00:00:00.000Z',
              endedAt: null,
              durationMinutes: null,
            },
            investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
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
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { notificationId: NOTIFICATION_1, notificationType: 'NON_SEVERE' },
      }),
    ),
    http.get(`http://localhost:4500/api/notification-pregnancies/notification/${NOTIFICATION_1}`, () =>
      pregnancyRow
        ? HttpResponse.json({ ok: true, message: 'ok', data: pregnancyRow })
        : HttpResponse.json(
            { ok: false, message: 'no encontrado', code: 'NOTIFPRG_006_NOT_FOUND' },
            { status: 404 },
          ),
    ),
    http.put(`http://localhost:4500/api/notification-pregnancies/${PREGNANCY_1}`, async ({ request }) => {
      pregnancyPutBody = (await request.json()) as Record<string, unknown>;
      pregnancyRow = { ...pregnancyRow, ...pregnancyPutBody };
      return HttpResponse.json({ ok: true, message: 'ok', data: pregnancyRow });
    }),
    http.get(
      `http://localhost:4500/api/notification-pregnancy-complications/pregnancy/${PREGNANCY_1}`,
      () =>
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
                      complicationTypeItemId: null,
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
  return { getPregnancyPutBody: () => pregnancyPutBody };
}

function renderDialogInCase() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PatientFormDialog open caseId={CASE_1} patientId={PATIENT_1} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('PatientFormDialog — el bloqueo de embarazo del paso 13, sexo y fecha de nacimiento (SPEC FE12d §4 paso 13, §8)', () => {
  it('cambiar el sexo a masculino con datos de embarazo cargados no guarda; «Vaciar» lo limpia y entonces sí', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockSexCatalog();
    mockGeoLocationPickerEmpty();
    mockPatientDetail({
      birthDate: '2000-01-15',
      sex: { catalogItemId: SEX_FEMALE_1, code: 'FEMALE', name: 'Femenino', value: 'FEMALE' },
    });
    const { getPregnancyPutBody } = mockPregnancyBlockScenario(0);
    let patientPutCalls = 0;
    server.use(
      http.put(`http://localhost:4500/api/patients/${PATIENT_1}`, async () => {
        patientPutCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: makePatient() });
      }),
    );

    renderDialogInCase();

    await user.click(await screen.findByRole('combobox', { name: 'Sexo' }));
    await user.click(await screen.findByRole('option', { name: 'Masculino' }));

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByText('Hay datos de embarazo cargados')).toBeInTheDocument();
    expect(await screen.findByText(/No se puede guardar este cambio de sexo/)).toBeInTheDocument();
    expect(patientPutCalls).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Vaciar el bloque de embarazo' }));

    await waitFor(() => expect(getPregnancyPutBody()).not.toBeNull());
    await waitFor(() => expect(screen.queryByText('Hay datos de embarazo cargados')).not.toBeInTheDocument());

    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    await waitFor(() => expect(patientPutCalls).toBe(1));
  }, 60000);

  it('una fecha de nacimiento que deja la edad fuera de 15–49 bloquea igual que el sexo', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockSexCatalog();
    mockGeoLocationPickerEmpty();
    mockPatientDetail({
      birthDate: '2000-01-15',
      sex: { catalogItemId: SEX_FEMALE_1, code: 'FEMALE', name: 'Femenino', value: 'FEMALE' },
    });
    mockPregnancyBlockScenario(0);

    renderDialogInCase();

    const birthDateInput = await screen.findByLabelText('Fecha de nacimiento');
    // A los 5 años el 2026-01-15 (SPEC FE12d §4 paso 13, verificación): muy fuera de 15–49.
    await user.clear(birthDateInput);
    await user.type(birthDateInput, '2021-01-15');

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByText(/dejaría al paciente fuera del rango de edad del embarazo/)).toBeInTheDocument();
  }, 60000);

  it('con complicaciones activas, el diálogo las cuenta, no ofrece vaciar y con USER menciona al administrador', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockSexCatalog();
    mockGeoLocationPickerEmpty();
    mockPatientDetail({
      birthDate: '2000-01-15',
      sex: { catalogItemId: SEX_FEMALE_1, code: 'FEMALE', name: 'Femenino', value: 'FEMALE' },
    });
    mockPregnancyBlockScenario(1);

    renderDialogInCase();

    await user.click(await screen.findByRole('combobox', { name: 'Sexo' }));
    await user.click(await screen.findByRole('option', { name: 'Masculino' }));

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(
      await screen.findByText(
        'Hay 1 complicación(es) activa(s) registradas. Sólo un administrador puede retirarlas antes de poder vaciar el bloque.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vaciar el bloque de embarazo' })).toBeDisabled();
  }, 60000);
});
