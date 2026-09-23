import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserRolesCard } from './UserRolesCard';

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
const ROLE_ANALYTICS = '33333333-3333-4333-8333-333333333333';

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
          count: 3,
          rows: [
            role(ROLE_ADMIN, 'ADMIN', 'Administrador', 50),
            role(ROLE_USER, 'USER', 'Usuario', 25),
            role(ROLE_ANALYTICS, 'ANALYTICS', 'Analítica', 10),
          ],
        },
      }),
    ),
  );
}

function assignment(userRoleId: string, roleId: string, name: string, code: string, level: number) {
  return {
    userRoleId,
    userId: USER_ID,
    roleId,
    assignedByUserId: null,
    isActive: true,
    role: { roleId, name, code, level },
  };
}

function mockAssignments(rows: ReturnType<typeof assignment>[]) {
  server.use(
    http.get(`http://localhost:4500/api/user-roles/user/${USER_ID}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: rows.length, user: { userId: USER_ID }, rows },
      }),
    ),
  );
}

function renderCard(readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UserRolesCard userId={USER_ID} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

describe('UserRolesCard — el diff de §3.5', () => {
  it('«Guardar» está deshabilitado mientras la selección coincide con lo vigente', async () => {
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);

    renderCard();

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    expect(screen.getByRole('button', { name: 'Guardar roles' })).toBeDisabled();
  });

  it('añadir un rol a quien ya tiene otro manda en el bulk sólo el rol nuevo', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/user-roles/bulk', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: { created: 1 } });
      }),
    );

    renderCard();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.roleIds).toEqual([ROLE_USER]);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('añadir uno y retirar otro produce una llamada a bulk y una a DELETE, en ese orden', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);
    const calls: string[] = [];
    server.use(
      http.post('http://localhost:4500/api/user-roles/bulk', () => {
        calls.push('bulk');
        return HttpResponse.json({ ok: true, message: 'ok', data: { created: 1 } });
      }),
      http.delete('http://localhost:4500/api/user-roles/:id', ({ params }) => {
        calls.push(`delete:${String(params.id)}`);
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderCard();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));

    await waitFor(() => expect(calls).toEqual(['bulk', 'delete:a-1']));
  });

  it('devolver un rol revocado no llama a PATCH activate: lo resuelve el bulk', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    // El par revocado no aparece en 002A, así que para el cliente es un alta más.
    mockAssignments([]);
    let activateCalls = 0;
    server.use(
      http.post('http://localhost:4500/api/user-roles/bulk', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { created: 1 } }),
      ),
      http.patch('http://localhost:4500/api/user-roles/activate/:id', () => {
        activateCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderCard();
    await user.click(await screen.findByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(activateCalls).toBe(0);
  });

  it('si el lote de altas falla no se revoca nada', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);
    let deleteCalls = 0;
    server.use(
      http.post('http://localhost:4500/api/user-roles/bulk', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'La asignación ya existe',
            code: 'USERROLE_007_ASSIGNMENT_EXISTS',
          },
          { status: 409 },
        ),
      ),
      http.delete('http://localhost:4500/api/user-roles/:id', () => {
        deleteCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderCard();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(deleteCalls).toBe(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('si la primera baja falla, la segunda se ejecuta y el resumen nombra la que no se aplicó', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([
      assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50),
      assignment('a-2', ROLE_USER, 'Usuario', 'USER', 25),
    ]);
    const deleted: string[] = [];
    server.use(
      http.delete('http://localhost:4500/api/user-roles/:id', ({ params }) => {
        const id = String(params.id);
        deleted.push(id);
        if (id === 'a-1') {
          return HttpResponse.json(
            {
              ok: false,
              message: 'No se puede retirar el último superadministrador',
              code: 'USERROLE_005A_LAST_SUPERADMIN',
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderCard();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));

    await waitFor(() => expect(deleted).toEqual(['a-1', 'a-2']));
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Administrador (No se puede retirar el último superadministrador)'),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('UserRolesCard — permisos y estado', () => {
  it('sin ADMIN el botón Guardar no está en el DOM', async () => {
    signInAs('USER', 25);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);

    renderCard();

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    expect(screen.queryByRole('button', { name: 'Guardar roles' })).not.toBeInTheDocument();
  });

  it('en readOnly (usuario inactivo) se ven los roles pero no el botón', async () => {
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([assignment('a-1', ROLE_ADMIN, 'Administrador', 'ADMIN', 50)]);

    renderCard(true);

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeChecked(),
    );
    expect(screen.getByRole('checkbox', { name: 'Administrador' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar roles' })).not.toBeInTheDocument();
  });

  it('un usuario sin ningún rol lo dice explícitamente', async () => {
    signInAs('ADMIN', 50);
    mockCatalog();
    mockAssignments([]);

    renderCard();

    expect(
      await screen.findByText(/Este usuario no tiene ningún rol asignado/),
    ).toBeInTheDocument();
  });
});
