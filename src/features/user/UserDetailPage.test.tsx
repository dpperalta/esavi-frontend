import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import type { User } from '@/contracts/declared/user';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserDetailPage } from './UserDetailPage';

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
const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';

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
  // The roles card of the ficha reads both of these.
  server.use(
    http.get('http://localhost:4500/api/roles', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              roleId: ROLE_ADMIN,
              code: 'ADMIN',
              name: 'Administrador',
              description: '',
              level: 50,
              isSystemRole: true,
              isActive: true,
            },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/user-roles/user/${USER_ID}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: 0, user: { userId: USER_ID }, rows: [] },
      }),
    ),
  );
});

function signInAs(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function detail(overrides: Partial<User> = {}): User {
  return {
    userId: USER_ID,
    username: 'aperez',
    email: 'ana@minsa.gob',
    firstName: 'Ana',
    lastName: 'Pérez',
    displayName: 'Ana Pérez',
    phone: '0999999999',
    requiresPasswordChange: true,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    roles: [{ roleId: ROLE_ADMIN, name: 'Administrador', code: 'ADMIN', level: 50 }],
    ...overrides,
  };
}

function mockDetail(data: User) {
  server.use(
    http.get(`http://localhost:4500/api/users/${USER_ID}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/users/:id', element: <UserDetailPage /> },
      { path: '/users', element: <p>listado</p> },
    ],
    { initialEntries: [`/users/${USER_ID}`] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('UserDetailPage — la ficha (ESAVI-USER-003)', () => {
  it('pinta los datos del usuario y el aviso de cambio de contraseña', async () => {
    signInAs('ADMIN', 50);
    mockDetail(detail());

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument();
    expect(screen.getByText('ana@minsa.gob')).toBeInTheDocument();
    expect(screen.getByText('aperez')).toBeInTheDocument();
    expect(screen.getByText('0999999999')).toBeInTheDocument();
    expect(screen.getByText(/tendrá que cambiar la contraseña/)).toBeInTheDocument();
  });

  it('no duplica el historial de auditoría: vive en el Sheet del listado', async () => {
    signInAs('SUPERADMIN', 100);
    mockDetail(detail());

    renderPage();

    await screen.findByRole('heading', { name: 'Ana Pérez' });
    expect(screen.queryByText('Historial de auditoría')).not.toBeInTheDocument();
  });

  it('USER_003_NOT_FOUND pinta la pantalla de «no existe» con enlace al listado', async () => {
    signInAs('ADMIN', 50);
    server.use(
      http.get(`http://localhost:4500/api/users/${USER_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Usuario no encontrado', code: 'USER_003_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText('Este usuario no existe o fue eliminado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a usuarios' })).toHaveAttribute(
      'href',
      '/users',
    );
  });
});

describe('UserDetailPage — ciclo de vida', () => {
  it('con ADMIN el botón «Reactivar» no está en el DOM aunque el usuario esté inactivo', async () => {
    signInAs('ADMIN', 50);
    mockDetail(detail({ isActive: false }));

    renderPage();

    expect((await screen.findAllByText('Inactivo')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN sí aparece «Reactivar» y llama a 005B', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockDetail(detail({ isActive: false }));
    let activateCalls = 0;
    server.use(
      http.patch(`http://localhost:4500/api/users/activate/${USER_ID}`, () => {
        activateCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));
    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(activateCalls).toBe(1));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('con un usuario inactivo los controles de edición están ocultos', async () => {
    signInAs('ADMIN', 50);
    mockDetail(detail({ isActive: false }));

    renderPage();

    await screen.findByRole('heading', { name: 'Ana Pérez' });
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('USER_005A_SELF_DEACTIVATION muestra su mensaje propio', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockDetail(detail());
    server.use(
      http.delete(`http://localhost:4500/api/users/${USER_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'No puedes desactivarte', code: 'USER_005A_SELF_DEACTIVATION' },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('No puedes darte de baja a ti mismo.'),
    );
  });

  it('USER_005A_LAST_SUPERADMIN muestra su mensaje propio', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockDetail(detail());
    server.use(
      http.delete(`http://localhost:4500/api/users/${USER_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Es el último', code: 'USER_005A_LAST_SUPERADMIN' },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'No se puede dar de baja al último superadministrador.',
      ),
    );
  });
});
