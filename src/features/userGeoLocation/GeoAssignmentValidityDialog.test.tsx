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
import { GeoAssignmentValidityDialog } from './GeoAssignmentValidityDialog';

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

const assignment: GeoAssignment = {
  userGeoLocationId: 'ugl-1',
  userId: USER_ID,
  geoLocationId: PICHINCHA,
  validFrom: '2026-03-01T00:00:00.000-05:00',
  validTo: null,
  assignedByUserId: null,
  isActive: true,
  createdAt: '2026-03-01T00:00:00.000-05:00',
  updatedAt: null,
  deletedAt: null,
  appDetails: null,
  geoLocation: {
    geoLocationId: PICHINCHA,
    name: 'Pichincha',
    level: 1,
    parentGeoLocationId: null,
  },
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GeoAssignmentValidityDialog open onOpenChange={() => {}} assignment={assignment} />
    </QueryClientProvider>,
  );
}

describe('GeoAssignmentValidityDialog — ESAVI-USERGEO-004', () => {
  it('abre con el día de la fila, recortado en local', async () => {
    renderDialog();

    const from = await screen.findByLabelText('Desde');
    expect(from).toHaveValue('2026-03-01');
    expect(await screen.findByLabelText('Hasta')).toHaveValue('');
  });

  it('el mismo día en las dos fechas viaja como un día completo, no como un rango vacío', async () => {
    const user = setupUser();
    let body: { validFrom?: string; validTo?: string } | null = null;
    server.use(
      http.put('http://localhost:4500/api/user-geo-locations/ugl-1', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Hasta'), '2026-03-01');
    await user.click(screen.getByRole('button', { name: 'Guardar vigencia' }));

    await waitFor(() => expect(body).not.toBeNull());
    const from = new Date(body!.validFrom!);
    const to = new Date(body!.validTo!);
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('un validTo anterior a validFrom se detiene en el cliente: no hay petición', async () => {
    const user = setupUser();
    let calls = 0;
    server.use(
      http.put('http://localhost:4500/api/user-geo-locations/ugl-1', () => {
        calls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Hasta'), '2026-02-01');
    await user.click(screen.getByRole('button', { name: 'Guardar vigencia' }));

    await waitFor(() =>
      expect(
        screen.getByText('La fecha de fin tiene que ser posterior a la de inicio.'),
      ).toBeInTheDocument(),
    );
    expect(calls).toBe(0);
  });

  it('el cuerpo del 004 lleva sólo las dos fechas: userId o geoLocationId darían 400', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('http://localhost:4500/api/user-geo-locations/ugl-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Hasta'), '2026-04-01');
    await user.click(screen.getByRole('button', { name: 'Guardar vigencia' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(Object.keys(body!).sort()).toEqual(['validFrom', 'validTo']);
  });

  it('el 409 INVALID_DATE_RANGE del servidor se pinta bajo validTo', async () => {
    const user = setupUser();
    server.use(
      http.put('http://localhost:4500/api/user-geo-locations/ugl-1', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Rango inválido',
            code: 'USERGEO_004_INVALID_DATE_RANGE',
            errors: null,
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Hasta'), '2026-04-01');
    await user.click(screen.getByRole('button', { name: 'Guardar vigencia' }));

    await waitFor(() => expect(screen.getByText('Rango inválido')).toBeInTheDocument());
    expect(toastError).not.toHaveBeenCalled();
  });
});
