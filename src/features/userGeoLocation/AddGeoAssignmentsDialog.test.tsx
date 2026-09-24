import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { AddGeoAssignmentsDialog } from './AddGeoAssignmentsDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const USER_ID = 'user-1';
const PICHINCHA = '11111111-1111-4111-8111-111111111111';
const GUAYAS = '22222222-2222-4222-8222-222222222222';
const AZUAY = '33333333-3333-4333-8333-333333333333';
const PROVINCE_LEVEL = 'lvl-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function signInAsAdmin() {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: 'me-1',
          roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }],
        },
      }),
    ),
  );
}

function province(geoLocationId: string, name: string) {
  return {
    geoLocationId,
    name,
    code: name.toUpperCase(),
    geoLevelTypeId: PROVINCE_LEVEL,
    parentGeoLocationId: null,
    isActive: true,
  };
}

// Un solo nivel en el árbol: elegida la provincia, el nivel siguiente viene vacío y la cascada
// se detiene ahí, que es la selección final.
function mockGeoTree(provinces: ReturnType<typeof province>[]) {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLevelTypeId: PROVINCE_LEVEL,
              name: 'Provincia',
              code: 'PROVINCE',
              sortOrder: 1,
              isActive: true,
            },
          ],
        },
      }),
    ),
    http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
      const url = new URL(request.url);
      const rows = url.searchParams.get('parentId') ? [] : provinces;
      return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
    }),
    http.get('http://localhost:4500/api/geo-locations/:id', ({ params }) => {
      const found = provinces.find((row) => row.geoLocationId === params.id);
      return HttpResponse.json({ ok: true, message: 'ok', data: found ?? provinces[0] });
    }),
  );
}

function mockActiveAssignments(geoLocationIds: string[]) {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: geoLocationIds.length,
          user: { userId: USER_ID },
          rows: geoLocationIds.map((geoLocationId, index) => ({
            userGeoLocationId: `ugl-${index}`,
            userId: USER_ID,
            geoLocationId,
            validFrom: '2026-01-01T00:00:00.000-05:00',
            validTo: null,
            assignedByUserId: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000-05:00',
            updatedAt: null,
            deletedAt: null,
            appDetails: null,
            geoLocation: {
              geoLocationId,
              name: 'Asignada',
              level: 1,
              parentGeoLocationId: null,
            },
          })),
        },
      }),
    ),
  );
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AddGeoAssignmentsDialog open onOpenChange={() => {}} userId={USER_ID} />
    </QueryClientProvider>,
  );
}

async function pickProvince(user: ReturnType<typeof setupUser>, name: string) {
  await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));
  await user.click(await screen.findByRole('option', { name }));
  await user.click(screen.getByRole('button', { name: 'Añadir a la lista' }));
}

describe('AddGeoAssignmentsDialog — ESAVI-USERGEO-007', () => {
  it('dos ubicaciones producen UNA llamada a /bulk con dos ids', async () => {
    const user = setupUser();
    signInAsAdmin();
    mockActiveAssignments([]);
    mockGeoTree([province(PICHINCHA, 'Pichincha'), province(GUAYAS, 'Guayas')]);
    let bulkCalls = 0;
    let body: { geoLocationIds?: string[]; validFrom?: string; validTo?: string } | null = null;
    server.use(
      http.post('http://localhost:4500/api/user-geo-locations/bulk', async ({ request }) => {
        bulkCalls += 1;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 2, rows: [] } });
      }),
    );

    renderDialog();

    await pickProvince(user, 'Pichincha');
    await pickProvince(user, 'Guayas');
    await user.click(screen.getByRole('button', { name: 'Añadir ubicaciones' }));

    await waitFor(() => expect(bulkCalls).toBe(1));
    expect(body!.geoLocationIds).toEqual([PICHINCHA, GUAYAS]);
  });

  it('sin fechas, el lote viaja sin validFrom ni validTo: el servicio pone now()', async () => {
    const user = setupUser();
    signInAsAdmin();
    mockActiveAssignments([]);
    mockGeoTree([province(PICHINCHA, 'Pichincha')]);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/user-geo-locations/bulk', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [] } });
      }),
    );

    renderDialog();

    await pickProvince(user, 'Pichincha');
    await user.click(screen.getByRole('button', { name: 'Añadir ubicaciones' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(Object.keys(body!).sort()).toEqual(['geoLocationIds', 'userId']);
  });

  it('una ubicación con asignación activa no se ofrece en el picker', async () => {
    const user = setupUser();
    signInAsAdmin();
    mockActiveAssignments([PICHINCHA]);
    mockGeoTree([province(PICHINCHA, 'Pichincha'), province(GUAYAS, 'Guayas')]);

    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));

    expect(await screen.findByRole('option', { name: 'Guayas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pichincha' })).not.toBeInTheDocument();
  });

  it('una ubicación ya en la lista previa deja de ofrecerse', async () => {
    const user = setupUser();
    signInAsAdmin();
    mockActiveAssignments([]);
    mockGeoTree([province(PICHINCHA, 'Pichincha'), province(GUAYAS, 'Guayas')]);

    renderDialog();

    await pickProvince(user, 'Pichincha');

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));
    expect(screen.queryByRole('option', { name: 'Pichincha' })).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Guayas' })).toBeInTheDocument();
  });

  it('una ubicación con asignación CERRADA sí se ofrece: el 007 la reactiva', async () => {
    const user = setupUser();
    signInAsAdmin();
    // La fila existe pero está cerrada, así que no entra en el conjunto de exclusión.
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            user: { userId: USER_ID },
            rows: [
              {
                userGeoLocationId: 'ugl-0',
                userId: USER_ID,
                geoLocationId: AZUAY,
                validFrom: '2026-01-01T00:00:00.000-05:00',
                validTo: '2026-02-01T23:59:59.999-05:00',
                assignedByUserId: null,
                isActive: false,
                createdAt: '2026-01-01T00:00:00.000-05:00',
                updatedAt: null,
                deletedAt: '2026-02-01T23:59:59.999-05:00',
                appDetails: null,
                geoLocation: {
                  geoLocationId: AZUAY,
                  name: 'Azuay',
                  level: 1,
                  parentGeoLocationId: null,
                },
              },
            ],
          },
        }),
      ),
    );
    mockGeoTree([province(AZUAY, 'Azuay')]);

    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));
    expect(await screen.findByRole('option', { name: 'Azuay' })).toBeInTheDocument();
  });

  it('un 409 ASSIGNMENT_EXISTS pide reintentar por toast, no como error de campo', async () => {
    const user = setupUser();
    signInAsAdmin();
    mockActiveAssignments([]);
    mockGeoTree([province(PICHINCHA, 'Pichincha')]);
    server.use(
      http.post('http://localhost:4500/api/user-geo-locations/bulk', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe',
            code: 'USERGEO_007_ASSIGNMENT_EXISTS',
            errors: null,
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog();

    await pickProvince(user, 'Pichincha');
    await user.click(screen.getByRole('button', { name: 'Añadir ubicaciones' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toMatch(/Vuelve a intentarlo/);
  });
});
