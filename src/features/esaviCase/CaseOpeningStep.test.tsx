import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  localStorage.clear();
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
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

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
