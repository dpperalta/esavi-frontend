import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserGeoCoverageCard } from './UserGeoCoverageCard';

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

function signInAs(code: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: code, code, level }] },
      }),
    ),
  );
}

interface RowOptions {
  isActive?: boolean;
  validTo?: string | null;
}

function assignment(
  userGeoLocationId: string,
  geoLocationId: string,
  name: string,
  { isActive = true, validTo = null }: RowOptions = {},
) {
  return {
    userGeoLocationId,
    userId: USER_ID,
    geoLocationId,
    validFrom: '2026-01-01T00:00:00.000-05:00',
    validTo,
    assignedByUserId: null,
    isActive,
    createdAt: '2026-01-01T00:00:00.000-05:00',
    updatedAt: null,
    deletedAt: null,
    appDetails: null,
    geoLocation: { geoLocationId, name, level: 1, parentGeoLocationId: null },
  };
}

function mockCoverage(count = 0) {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_ID}/coverage`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          assigned: [],
          coverage: Array.from({ length: count }, (_unused, index) => ({
            geoLocationId: `cov-${index}`,
            name: `Cubierta ${index}`,
            level: 2,
            parentGeoLocationId: null,
          })),
          count,
        },
      }),
    ),
  );
}

function mockAssignments(rows: ReturnType<typeof assignment>[], admin = false) {
  const path = admin
    ? `http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`
    : `http://localhost:4500/api/user-geo-locations/user/${USER_ID}`;
  server.use(
    http.get(path, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: rows.length, user: { userId: USER_ID }, rows },
      }),
    ),
  );
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[`/users/${USER_ID}`]}>
      <QueryClientProvider client={queryClient}>
        <UserGeoCoverageCard userId={USER_ID} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// La distinción que justifica el spec: «activa» y «vigente» no son lo mismo, y una fila activa
// con validTo pasado no cubre nada.
describe('UserGeoCoverageCard — los tres badges de §3.6', () => {
  it('una fila activa con validTo en el pasado se pinta como vencida, no como vigente', async () => {
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([
      assignment('ugl-1', PICHINCHA, 'Pichincha', { validTo: '2020-01-01T23:59:59.999-05:00' }),
    ]);

    renderCard();

    await waitFor(() => expect(screen.getByText('Pichincha')).toBeInTheDocument());
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument();
  });

  it('una fila activa sin validTo se pinta como vigente y sin fecha de fin', async () => {
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([assignment('ugl-1', PICHINCHA, 'Pichincha')]);

    renderCard();

    await waitFor(() => expect(screen.getByText('Vigente')).toBeInTheDocument());
    expect(screen.getByText(/Sin fecha de fin/)).toBeInTheDocument();
  });

  it('una fila inactiva se pinta como cerrada', async () => {
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments(
      [assignment('ugl-1', PICHINCHA, 'Pichincha', { isActive: false })],
      /* admin */ false,
    );

    renderCard();

    await waitFor(() => expect(screen.getByText('Cerrada')).toBeInTheDocument());
  });
});

describe('UserGeoCoverageCard — estados y toggle', () => {
  it('sin asignaciones muestra el vacío propio del bloque, no un error', async () => {
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([]);

    renderCard();

    await waitFor(() =>
      expect(screen.getByText('Este usuario no tiene cobertura asignada.')).toBeInTheDocument(),
    );
  });

  it('el toggle salta a la ruta de administración y cambia el texto del vacío', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([]);
    let adminCalls = 0;
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`, () => {
        adminCalls += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 0, user: { userId: USER_ID }, rows: [] },
        });
      }),
    );

    renderCard();

    await waitFor(() =>
      expect(screen.getByText('Este usuario no tiene cobertura asignada.')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('switch', { name: 'Mostrar cerradas y vencidas' }));

    await waitFor(() => expect(adminCalls).toBe(1));
    expect(
      screen.getByText('Este usuario no tiene ninguna asignación, ni vigente ni cerrada.'),
    ).toBeInTheDocument();
  });
});

describe('UserGeoCoverageCard — cobertura efectiva, ESAVI-USERGEO-008', () => {
  it('un usuario sin cobertura muestra su texto propio, no un error', async () => {
    signInAs('ADMIN', 50);
    mockCoverage(0);
    mockAssignments([]);

    renderCard();

    await waitFor(() =>
      expect(screen.getByText('No cubre ninguna ubicación.')).toBeInTheDocument(),
    );
  });

  it('con cobertura muestra el recuento y despliega la expansión', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCoverage(2);
    mockAssignments([assignment('ugl-1', PICHINCHA, 'Pichincha')]);

    renderCard();

    const summary = await screen.findByText('Cubre 2 ubicaciones.');
    await user.click(summary);

    expect(screen.getByText('Cubierta 0')).toBeInTheDocument();
    expect(screen.getByText('Cubierta 1')).toBeInTheDocument();
  });
});

describe('UserGeoCoverageCard — guardas de rol', () => {
  it('con ADMIN el botón de reabrir no está en el DOM sobre una fila cerrada', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([assignment('ugl-1', GUAYAS, 'Guayas', { isActive: false })]);

    renderCard();

    await waitFor(() => expect(screen.getByText('Cerrada')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Acciones de la fila' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN sí está', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockCoverage();
    mockAssignments([assignment('ugl-1', GUAYAS, 'Guayas', { isActive: false })]);

    renderCard();

    await waitFor(() => expect(screen.getByText('Cerrada')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Acciones de la fila' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('sobre una fila cerrada no se ofrece editar vigencia: el 004 responde 409', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockCoverage();
    mockAssignments([assignment('ugl-1', GUAYAS, 'Guayas', { isActive: false })]);

    renderCard();

    await waitFor(() => expect(screen.getByText('Cerrada')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Acciones de la fila' }));

    const menu = await screen.findByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: 'Editar vigencia' }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Cerrar la asignación' }),
    ).not.toBeInTheDocument();
  });
});

describe('UserGeoCoverageCard — cierre, ESAVI-USERGEO-005A', () => {
  it('cerrar la única asignación activa avisa y deja confirmar', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCoverage();
    mockAssignments([assignment('ugl-1', PICHINCHA, 'Pichincha')]);
    // El conjunto activo completo que el aviso consulta al abrir la confirmación.
    server.use(
      http.get(`http://localhost:4500/api/user-geo-locations/admin/user/${USER_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            user: { userId: USER_ID },
            rows: [assignment('ugl-1', PICHINCHA, 'Pichincha')],
          },
        }),
      ),
    );
    let deleteCalls = 0;
    server.use(
      http.delete('http://localhost:4500/api/user-geo-locations/ugl-1', () => {
        deleteCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderCard();

    await waitFor(() => expect(screen.getByText('Vigente')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Acciones de la fila' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar la asignación' }));

    // Advertencia, no bloqueo: el backend no tiene esta guarda y el cliente no se la inventa.
    await waitFor(() =>
      expect(
        screen.getByText(/Es la última asignación vigente de este usuario/),
      ).toBeInTheDocument(),
    );
    const confirm = screen.getByRole('button', { name: 'Cerrar asignación' });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(deleteCalls).toBe(1));
  });
});
