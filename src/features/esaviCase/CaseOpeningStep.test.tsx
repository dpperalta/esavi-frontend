import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseOpeningStep } from './CaseOpeningStep';

const server = setupServer();

const USER_1 = '11111111-1111-4111-8111-111111111111';
const PATIENT_1 = '22222222-2222-4222-8222-222222222222';
const HFAC_1 = '33333333-3333-4333-8333-333333333333';
const CASE_1 = '44444444-4444-4444-8444-444444444444';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

// `usePregnancyBlockGuard` (SPEC FE12d §4 paso 13) pide `case-workflows/case/:id` y
// `patients/:id` en cada montaje de `CaseOpeningStep` en reentrada, no sólo en los tests del
// bloqueo — sin este respaldo, `onUnhandledRequest: 'error'` tumbaría el resto de la suite. Sin
// etapa de notificación, la cadena del guard se detiene ahí (§3.4): ningún otro test de este
// archivo necesita que el guard bloquee nada.
function mockPregnancyGuardChainClosed() {
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/PREGNANCY_FEMALE_SEX_ITEM', () =>
      HttpResponse.json(
        { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: CASE_1,
          status: { catalogItemId: 'status-1', code: 'IN_CASE_OPENING', name: 'Apertura' },
          previousStatus: null,
          openedAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            notification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
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
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
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
        },
      }),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  mockPregnancyGuardChainClosed();
});

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
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

function mockCoverage(data: { assigned: unknown[]; coverage: unknown[]; count: number }) {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_1}/coverage`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function mockCountryIsoCodeFallback() {
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE', () =>
      HttpResponse.json(
        { ok: false, message: 'not found', code: 'SYSCONF_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

function mockHealthFacilitySearch() {
  server.use(
    http.get('http://localhost:4500/api/health-facilities/search', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              healthFacilityId: HFAC_1,
              name: 'Centro de salud Norte',
              geoLocationId: null,
              geoLocation: null,
              facilityTypeItemId: null,
              facilityType: null,
              parentHealthFacilityId: null,
              localCode: null,
              officialName: null,
              shortName: null,
              address: null,
              latitude: null,
              longitude: null,
              phone: null,
              email: null,
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

function makeCaseDetail(overrides: Record<string, unknown> = {}) {
  return {
    caseId: CASE_1,
    caseCode: 'ESAVI-2026-0001',
    reportDate: null,
    eventDate: null,
    countryIsoCode: 'ECU',
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
      documentNumber: '1712345678',
      healthSystemCode: 'HSC-0001',
    },
    healthFacility: { healthFacilityId: HFAC_1, localCode: 'HFAC-1', name: 'Centro de salud Norte' },
    ...overrides,
  };
}

function mockVaccines(caseId: string, rows: Array<{ vaccineName: string; vaccinationDate: string | null }>) {
  server.use(
    http.get(`http://localhost:4500/api/notification-vaccines/case/${caseId}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function mockEmptyNotifierList(caseId: string) {
  server.use(
    http.get('http://localhost:4500/api/notifiers', ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('caseId')).toBe(caseId);
      return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
    }),
  );
}

describe('CaseOpeningStep — bloqueo por cobertura vacía (SPEC FE10 §1D, §5)', () => {
  it('con USER y cobertura vacía, el formulario no se pinta', async () => {
    signInAs('USER', 25);
    mockCoverage({ assigned: [], coverage: [], count: 0 });

    const router = createMemoryRouter(
      [{ path: '/esavi-cases/new/case-opening', element: <CaseOpeningStep /> }],
      { initialEntries: [`/esavi-cases/new/case-opening?patientId=${PATIENT_1}`] },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'No tienes territorio asignado. Pide a un administrador que te asigne cobertura geográfica: sin ella no puedes abrir casos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear caso' })).not.toBeInTheDocument();
  });
});

describe('CaseOpeningStep — reentrada (SPEC FE10 §5)', () => {
  it('el PUT no envía patientId', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockHealthFacilitySearch();
    server.use(
      http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }),
      ),
    );
    mockEmptyNotifierList(CASE_1);
    mockVaccines(CASE_1, []);
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/esavi-cases/${CASE_1}`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() });
      }),
    );

    const router = createMemoryRouter(
      [{ path: '/esavi-cases/:id/wizard/case-opening', element: <CaseOpeningStep /> }],
      { initialEntries: [`/esavi-cases/${CASE_1}/wizard/case-opening`] },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('ESAVI-2026-0001');
    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    // El guard de embarazo del paso 13 pide sus propias lecturas al montar (§3.4) — «Guardar»
    // queda inerte hasta que resuelven, para no dejar pasar la escritura que existe para impedir.
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).not.toHaveProperty('patientId');
  }, 60000);
});

describe('CaseOpeningStep — cadena CASE-001 → NOTIFIER-001 (SPEC FE10 §3.2, §5, §6)', () => {
  it('crea el caso, abre el modal de notificador; si el POST del notificador falla, el caso sigue creado y visible, con reintento', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockCoverage({
      assigned: [{ geoLocationId: 'g1', name: 'Pichincha', level: 1 }],
      coverage: [{ geoLocationId: 'g1', name: 'Pichincha', level: 1, parentGeoLocationId: null }],
      count: 1,
    });
    mockCountryIsoCodeFallback();
    mockHealthFacilitySearch();
    server.use(
      http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }),
      ),
    );
    server.use(
      http.post('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }, { status: 201 }),
      ),
    );
    mockEmptyNotifierList(CASE_1);
    server.use(
      http.post('http://localhost:4500/api/notifiers', () =>
        HttpResponse.json(
          { ok: false, message: 'La ubicación no existe', code: 'NOTIFIER_001_GEOLOCATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    const router = createMemoryRouter(
      [
        { path: '/esavi-cases/new/patient', element: <p>paso 1</p> },
        { path: '/esavi-cases/new/case-opening', element: <CaseOpeningStep /> },
        { path: '/esavi-cases/:id/wizard/classification', element: <p>clasificación</p> },
      ],
      {
        initialEntries: [
          '/esavi-cases/new/patient',
          `/esavi-cases/new/case-opening?patientId=${PATIENT_1}`,
        ],
        initialIndex: 1,
      },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole('combobox', { name: 'Unidad de salud' }), 'Centro');
    await user.click(await screen.findByRole('option', { name: /Centro de salud Norte/ }));
    await user.click(screen.getByRole('button', { name: 'Crear caso' }));

    // El caso queda creado y visible (su caseCode) aunque el notificador falle.
    expect(await screen.findByText('ESAVI-2026-0001')).toBeInTheDocument();

    // El modal del notificador se abrió solo (§6) — se completa y se envía para que el POST
    // simulado responda con el 404 de NOTIFIER_001_GEOLOCATION_NOT_FOUND.
    await user.type(await screen.findByLabelText('Nombres'), 'Juan');
    await user.type(screen.getByLabelText('Apellidos'), 'Gómez');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('La ubicación no existe')).toBeInTheDocument();

    // Cierra el modal fallido — el caso sigue creado, y el reintento sigue disponible desde la
    // lista, no sólo desde el modal que acaba de fallar.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Agregar notificador' })).toBeInTheDocument();

    // «Siguiente» no se ofrece sin ningún notificador (SPEC FE10 §5).
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  }, 90000);

  it('tras crear, el botón atrás del navegador no vuelve a ofrecer «Crear caso»', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockCoverage({
      assigned: [{ geoLocationId: 'g1', name: 'Pichincha', level: 1 }],
      coverage: [{ geoLocationId: 'g1', name: 'Pichincha', level: 1, parentGeoLocationId: null }],
      count: 1,
    });
    mockCountryIsoCodeFallback();
    mockHealthFacilitySearch();
    server.use(
      http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }),
      ),
    );
    server.use(
      http.post('http://localhost:4500/api/esavi-cases', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }, { status: 201 }),
      ),
    );
    // The list starts empty; once the notifier POST below succeeds, `['notifier']` is
    // invalidated and this refetches — from then on it reports the one just created.
    let notifierCreated = false;
    server.use(
      http.get('http://localhost:4500/api/notifiers', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: notifierCreated
            ? {
                count: 1,
                rows: [
                  {
                    notifierId: 'n1',
                    firstName: 'Juan',
                    lastName: 'Gómez',
                    email: null,
                    phoneNumber: null,
                    room: null,
                    address: null,
                    isActive: true,
                    case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null },
                    profession: null,
                    geoLocation: null,
                  },
                ],
              }
            : { count: 0, rows: [] },
        }),
      ),
      http.post('http://localhost:4500/api/notifiers', () => {
        notifierCreated = true;
        return HttpResponse.json(
          {
            ok: true,
            message: 'ok',
            data: {
              notifierId: 'n1',
              firstName: 'Juan',
              lastName: 'Gómez',
              email: null,
              phoneNumber: null,
              room: null,
              address: null,
              details: null,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
              case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: null },
              profession: null,
              geoLocation: null,
            },
          },
          { status: 201 },
        );
      }),
    );

    const router = createMemoryRouter(
      [
        { path: '/esavi-cases/new/patient', element: <p>paso 1</p> },
        { path: '/esavi-cases/new/case-opening', element: <CaseOpeningStep /> },
        { path: '/esavi-cases/:id/wizard/classification', element: <p>clasificación</p> },
      ],
      {
        initialEntries: [
          '/esavi-cases/new/patient',
          `/esavi-cases/new/case-opening?patientId=${PATIENT_1}`,
        ],
        initialIndex: 1,
      },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole('combobox', { name: 'Unidad de salud' }), 'Centro');
    await user.click(await screen.findByRole('option', { name: /Centro de salud Norte/ }));
    await user.click(screen.getByRole('button', { name: 'Crear caso' }));

    await screen.findByText('ESAVI-2026-0001');

    // The notifier dialog opened on its own (§6, decisión confirmada) — fill and submit it so it
    // closes, freeing «Siguiente» from behind the modal.
    await user.type(await screen.findByLabelText('Nombres'), 'Juan');
    await user.type(screen.getByLabelText('Apellidos'), 'Gómez');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/esavi-cases/${CASE_1}/wizard/classification`));

    router.navigate(-1);

    await waitFor(() => expect(router.state.location.pathname).toBe('/esavi-cases/new/patient'));
  }, 90000);
});

describe('CaseOpeningStep — aviso de eventDate contra vacunas (SPEC FE12c §8)', () => {
  async function renderReentry(onPut: (body: Record<string, unknown>) => void) {
    signInAs('ADMIN', 50);
    mockCountryIsoCodeFallback();
    mockHealthFacilitySearch();
    server.use(
      http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() }),
      ),
      http.put(`http://localhost:4500/api/esavi-cases/${CASE_1}`, async ({ request }) => {
        onPut((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail() });
      }),
    );
    mockEmptyNotifierList(CASE_1);

    const router = createMemoryRouter(
      [{ path: '/esavi-cases/:id/wizard/case-opening', element: <CaseOpeningStep /> }],
      { initialEntries: [`/esavi-cases/${CASE_1}/wizard/case-opening`] },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByText('ESAVI-2026-0001');
    return screen.getByLabelText('Fecha del evento');
  }

  it('con una vacuna del 10 de marzo, poner el 5 de marzo muestra el aviso nombrándola y deja guardar', async () => {
    const user = setupUser();
    mockVaccines(CASE_1, [{ vaccineName: 'BCG', vaccinationDate: '2026-03-10' }]);
    let receivedBody: Record<string, unknown> | null = null;
    const eventDateInput = await renderReentry((body) => (receivedBody = body));

    fireEvent.change(eventDateInput, { target: { value: '2026-03-05' } });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esta fecha deja vacunas con fecha posterior: BCG. Puedes guardar igual.',
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({ eventDate: '2026-03-05' });
  }, 30000);

  it('con la misma vacuna, poner el 10 de marzo no avisa', async () => {
    mockVaccines(CASE_1, [{ vaccineName: 'BCG', vaccinationDate: '2026-03-10' }]);
    const eventDateInput = await renderReentry(() => {});

    fireEvent.change(eventDateInput, { target: { value: '2026-03-10' } });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  }, 30000);

  it('sin vacunas cargadas, tampoco avisa', async () => {
    mockVaccines(CASE_1, []);
    const eventDateInput = await renderReentry(() => {});

    fireEvent.change(eventDateInput, { target: { value: '2026-03-05' } });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  }, 30000);
});

const NOTIFICATION_1 = '55555555-5555-4555-8555-555555555555';
const PREGNANCY_1 = '66666666-6666-4666-8666-666666666666';

describe('CaseOpeningStep — el bloqueo de embarazo del paso 13 (SPEC FE12d §4 paso 13, §8)', () => {
  it('un eventDate que deja la edad fuera de 15–49 con datos de embarazo cargados no guarda; «Vaciar» lo limpia y entonces sí', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCountryIsoCodeFallback();
    mockHealthFacilitySearch();
    mockVaccines(CASE_1, []);
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
      http.get(`http://localhost:4500/api/esavi-cases/${CASE_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail({ eventDate: '2026-01-15' }) }),
      ),
      // El paciente es mujer en edad fértil hoy (26 años el 2026-01-15): la compuerta está abierta
      // con el `eventDate` actual, y el cambio a un `eventDate` mucho más antiguo la cerraría.
      http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            patientId: PATIENT_1,
            names: 'Ana',
            lastNames: 'Pérez',
            documentNumber: '1712345678',
            passportNumber: null,
            birthDate: '2000-01-15',
            healthSystemCode: 'HSC-0001',
            email: null,
            phoneNumber: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            sex: { catalogItemId: 'sex-FEMALE', code: 'FEMALE', name: 'Femenino', value: 'FEMALE' },
            residence: null,
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
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    mockEmptyNotifierList(CASE_1);
    let esaviCasePutCalls = 0;
    server.use(
      http.put(`http://localhost:4500/api/esavi-cases/${CASE_1}`, async () => {
        esaviCasePutCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: makeCaseDetail({ eventDate: '2005-01-15' }) });
      }),
    );

    const router = createMemoryRouter(
      [{ path: '/esavi-cases/:id/wizard/case-opening', element: <CaseOpeningStep /> }],
      { initialEntries: [`/esavi-cases/${CASE_1}/wizard/case-opening`] },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const eventDateInput = await screen.findByLabelText('Fecha del evento');
    // A los 5 años, muy fuera de 15–49 (SPEC FE12d §4 paso 13, verificación).
    fireEvent.change(eventDateInput, { target: { value: '2005-01-15' } });

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    // El guard pide siete lecturas propias al montar (§3.4) — sin esperar a que resuelvan, el
    // primer «Guardar» encontraría `hasPregnancyData` en `false` por falta de datos, no porque no
    // los haya (SPEC FE12d §4 paso 13, race descubierta al escribir este mismo test).
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByText('Hay datos de embarazo cargados')).toBeInTheDocument();
    expect(esaviCasePutCalls).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Vaciar el bloque de embarazo' }));

    await waitFor(() => expect(pregnancyPutBody).not.toBeNull());
    expect(pregnancyPutBody).toMatchObject({
      wasPregnantAtVaccination: null,
      wasPregnantAtEsavi: null,
      lastMenstruationDate: null,
      probableDeliveryDate: null,
      hasComplications: null,
      notes: null,
    });
    // Sin `<Toaster>` montado en este árbol de render, el aviso no deja rastro visible (mismo
    // motivo que documenta `PatientFormDialog.test.tsx`) — la prueba real de que se desbloqueó es
    // que el segundo «Guardar» sí llega al `PUT` del caso.
    await waitFor(() => expect(screen.queryByText('Hay datos de embarazo cargados')).not.toBeInTheDocument());

    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    await waitFor(() => expect(esaviCasePutCalls).toBe(1));
  }, 60000);
});
