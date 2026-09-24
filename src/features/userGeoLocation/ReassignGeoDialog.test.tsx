import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import type { GeoAssignment } from '@/contracts/declared/userGeoLocation';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { ReassignGeoDialog } from './ReassignGeoDialog';

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
  );
}

function row(userGeoLocationId: string, geoLocationId: string, name: string): GeoAssignment {
  return {
    userGeoLocationId,
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
    geoLocation: { geoLocationId, name, level: 1, parentGeoLocationId: null },
  };
}

function mockActiveAssignments(rows: GeoAssignment[]) {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: rows.length, user: { userId: USER_ID }, rows },
      }),
    ),
  );
}

function renderDialog(assignment: GeoAssignment) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReassignGeoDialog open onOpenChange={() => {}} userId={USER_ID} assignment={assignment} />
    </QueryClientProvider>,
  );
}

describe('ReassignGeoDialog — ESAVI-USERGEO-006', () => {
  it('avisa de que la asignación actual se cerrará, en una sola transacción', async () => {
    signInAsAdmin();
    const source = row('ugl-1', PICHINCHA, 'Pichincha');
    mockActiveAssignments([source]);
    mockGeoTree([province(PICHINCHA, 'Pichincha'), province(GUAYAS, 'Guayas')]);

    renderDialog(source);

    expect(
      await screen.findByText(/La asignación actual se cerrará.*una sola transacción/s),
    ).toBeInTheDocument();
  });

  it('reasignar produce UNA llamada a /reassign/:id con el destino en el cuerpo', async () => {
    const user = setupUser();
    signInAsAdmin();
    const source = row('ugl-1', PICHINCHA, 'Pichincha');
    mockActiveAssignments([source]);
    mockGeoTree([province(PICHINCHA, 'Pichincha'), province(GUAYAS, 'Guayas')]);
    let calls = 0;
    let body: { geoLocationId?: string } | null = null;
    server.use(
      http.patch(
        'http://localhost:4500/api/user-geo-locations/reassign/ugl-1',
        async ({ request }) => {
          calls += 1;
          body = (await request.json()) as typeof body;
          return HttpResponse.json({ ok: true, message: 'ok', data: {} });
        },
      ),
    );

    renderDialog(source);

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));
    await user.click(await screen.findByRole('option', { name: 'Guayas' }));
    await user.click(screen.getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(calls).toBe(1));
    expect(body).toEqual({ geoLocationId: GUAYAS });
  });

  it('el picker de destino no ofrece el origen ni lo que el usuario ya cubre', async () => {
    const user = setupUser();
    signInAsAdmin();
    const source = row('ugl-1', PICHINCHA, 'Pichincha');
    // El origen y una segunda ubicación ya cubierta: ninguna de las dos puede ser destino.
    mockActiveAssignments([source, row('ugl-2', GUAYAS, 'Guayas')]);
    mockGeoTree([
      province(PICHINCHA, 'Pichincha'),
      province(GUAYAS, 'Guayas'),
      province(AZUAY, 'Azuay'),
    ]);

    renderDialog(source);

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));

    expect(await screen.findByRole('option', { name: 'Azuay' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pichincha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Guayas' })).not.toBeInTheDocument();
  });

  it('el 409 SAME_GEOLOCATION se pinta en el campo del picker, no en un toast', async () => {
    const user = setupUser();
    signInAsAdmin();
    const source = row('ugl-1', PICHINCHA, 'Pichincha');
    mockActiveAssignments([]);
    mockGeoTree([province(GUAYAS, 'Guayas')]);
    server.use(
      http.patch('http://localhost:4500/api/user-geo-locations/reassign/ugl-1', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Es la misma ubicación',
            code: 'USERGEO_006_SAME_GEOLOCATION',
            errors: null,
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(source);

    await user.click(await screen.findByRole('combobox', { name: /Provincia/ }));
    await user.click(await screen.findByRole('option', { name: 'Guayas' }));
    await user.click(screen.getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(screen.getByText('Es la misma ubicación')).toBeInTheDocument());
    expect(toastError).not.toHaveBeenCalled();
  });
});
