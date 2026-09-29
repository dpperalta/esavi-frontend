import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserRoleHistorySheet } from './UserRoleHistorySheet';

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
const ROLE_USER = '22222222-2222-4222-8222-222222222222';
const ROLE_RETIRED = '44444444-4444-4444-8444-444444444444';
const HISTORY_URL = `http://localhost:4500/api/user-roles/admin/user/${USER_ID}`;

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

// Resolves once `/users/me` has answered, so an assertion of absence is not made before the
// viewer's role is known.
function signInAs(roleName: string, level: number) {
  let answered = false;
  server.use(
    http.get('http://localhost:4500/api/users/me', () => {
      answered = true;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      });
    }),
  );
  return () => answered;
}

function role(roleId: string, code: string, name: string, level: number) {
  return { roleId, code, name, description: '', level, isSystemRole: true, isActive: true };
}

function mockCatalog() {
  server.use(
    http.get('http://localhost:4500/api/roles', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            role(ROLE_ADMIN, 'ADMIN', 'Administrador', 50),
            role(ROLE_USER, 'USER', 'Usuario', 25),
          ],
        },
      }),
    ),
  );
}

function assignment(
  userRoleId: string,
  roleId: string,
  name: string,
  isActive: boolean,
  dates: { createdAt: string; deletedAt: string | null },
) {
  return {
    userRoleId,
    userId: USER_ID,
    roleId,
    assignedByUserId: null,
    isActive,
    createdAt: dates.createdAt,
    updatedAt: null,
    deletedAt: dates.deletedAt,
    role: { roleId, name, code: name.toUpperCase(), level: 25 },
  };
}

const ACTIVE_ADMIN = assignment('ur-1', ROLE_ADMIN, 'Administrador', true, {
  createdAt: '2026-03-10T12:00:00.000Z',
  deletedAt: null,
});
const REVOKED_USER = assignment('ur-2', ROLE_USER, 'Usuario', false, {
  createdAt: '2026-01-05T12:00:00.000Z',
  deletedAt: '2026-02-20T12:00:00.000Z',
});
const REVOKED_RETIRED = assignment('ur-3', ROLE_RETIRED, 'Notificador', false, {
  createdAt: '2025-11-01T12:00:00.000Z',
  deletedAt: '2025-12-01T12:00:00.000Z',
});

function mockHistory(rows: ReturnType<typeof assignment>[]) {
  let calls = 0;
  server.use(
    http.get(HISTORY_URL, () => {
      calls += 1;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: rows.length, user: { userId: USER_ID }, rows },
      });
    }),
  );
  return () => calls;
}

function renderSheet(readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UserRoleHistorySheet userId={USER_ID} readOnly={readOnly} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

function rowOf(roleName: string) {
  return screen.getByText(roleName).closest('li')!;
}

describe('UserRoleHistorySheet — ESAVI-USERROLE-002B (SPEC FE28)', () => {
  it('pinta vigentes y revocadas con su badge, y la fecha de revocación sólo en las revocadas', async () => {
    signInAs('ADMIN', 50);
    mockCatalog();
    mockHistory([ACTIVE_ADMIN, REVOKED_USER]);

    renderSheet();

    await waitFor(() => expect(screen.getByText('Administrador')).toBeInTheDocument());
    const active = rowOf('Administrador');
    const revoked = rowOf('Usuario');

    expect(within(active).getByText('Vigente')).toBeInTheDocument();
    expect(within(active).getByText('10/03/2026')).toBeInTheDocument();
    expect(within(active).queryByText('Revocado el')).toBeNull();

    expect(within(revoked).getByText('Revocado')).toBeInTheDocument();
    expect(within(revoked).getByText('Revocado el')).toBeInTheDocument();
    expect(within(revoked).getByText('20/02/2026')).toBeInTheDocument();
  });

  it('con ADMIN no hay botón «Reactivar»', async () => {
    const meAnswered = signInAs('ADMIN', 50);
    mockCatalog();
    mockHistory([REVOKED_USER]);

    renderSheet();

    await waitFor(() => expect(screen.getByText('Usuario')).toBeInTheDocument());
    await waitFor(() => expect(meAnswered()).toBe(true));
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
  });

  it('con SUPERADMIN y el usuario inactivo (readOnly) tampoco hay botón', async () => {
    const meAnswered = signInAs('SUPERADMIN', 100);
    mockCatalog();
    mockHistory([REVOKED_USER]);

    renderSheet(true);

    await waitFor(() => expect(screen.getByText('Usuario')).toBeInTheDocument());
    await waitFor(() => expect(meAnswered()).toBe(true));
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
  });

  it('con un rol retirado del catálogo, «Reactivar» está deshabilitado y describe por qué', async () => {
    signInAs('SUPERADMIN', 100);
    mockCatalog();
    mockHistory([REVOKED_RETIRED]);

    renderSheet();

    const button = await screen.findByRole('button', { name: 'Reactivar' });
    await waitFor(() => expect(button).toHaveAttribute('aria-describedby'));
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'El rol está retirado. Reactívalo primero en la pantalla de roles.',
    );
  });

  it('reactivar confirma, hace PATCH por userRoleId y vuelve a pedir 002B', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockCatalog();
    const historyCalls = mockHistory([REVOKED_USER]);
    let patchedId = '';
    server.use(
      http.patch('http://localhost:4500/api/user-roles/activate/:id', ({ params }) => {
        patchedId = String(params.id);
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    renderSheet();

    const button = await screen.findByRole('button', { name: 'Reactivar' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(patchedId).toBe('ur-2'));
    await waitFor(() => expect(historyCalls()).toBe(2));
    expect(toastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('409 USERROLE_005B_ALREADY_ACTIVE cierra el diálogo, avisa y vuelve a pedir 002B', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockCatalog();
    const historyCalls = mockHistory([REVOKED_USER]);
    server.use(
      http.patch('http://localhost:4500/api/user-roles/activate/:id', () =>
        HttpResponse.json(
          { ok: false, message: 'Already active', code: 'USERROLE_005B_ALREADY_ACTIVE' },
          { status: 409 },
        ),
      ),
    );

    renderSheet();

    const button = await screen.findByRole('button', { name: 'Reactivar' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Esta asignación ya estaba vigente. Se actualizó el historial.',
      ),
    );
    await waitFor(() => expect(historyCalls()).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('un error de 002B muestra el mensaje y «Reintentar» vuelve a pedirlo', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    let calls = 0;
    server.use(
      http.get(HISTORY_URL, () => {
        calls += 1;
        return HttpResponse.json(
          { ok: false, message: 'User not found', code: 'USERROLE_002B_USER_NOT_FOUND' },
          { status: 404 },
        );
      }),
    );

    renderSheet();

    expect(await screen.findByText('User not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('con rows: [] muestra el estado vacío', async () => {
    signInAs('ADMIN', 50);
    mockCatalog();
    mockHistory([]);

    renderSheet();

    expect(
      await screen.findByText('Este usuario nunca ha tenido un rol asignado.'),
    ).toBeInTheDocument();
  });
});
