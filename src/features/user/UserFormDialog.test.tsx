import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import type { User } from '@/contracts/declared/user';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserFormDialog } from './UserFormDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';
const ROLE_USER = '22222222-2222-4222-8222-222222222222';

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
  server.use(
    http.get('http://localhost:4500/api/roles', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
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
            {
              roleId: ROLE_USER,
              code: 'USER',
              name: 'Usuario',
              description: '',
              level: 25,
              isSystemRole: true,
              isActive: true,
            },
          ],
        },
      }),
    ),
  );
});

function existingUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-1',
    username: 'aperez',
    email: 'ana@minsa.gob',
    firstName: 'Ana',
    lastName: 'Pérez',
    displayName: 'Ana Pérez',
    phone: '0999999999',
    requiresPasswordChange: false,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    roles: [{ roleId: ROLE_ADMIN, name: 'Administrador', code: 'ADMIN', level: 50 }],
    ...overrides,
  };
}

function renderDialog(userId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UserFormDialog open userId={userId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

async function fillIdentity(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText('Nombres'), 'Ana');
  await user.type(screen.getByLabelText('Apellidos'), 'Pérez');
  await user.type(screen.getByLabelText('Correo'), 'ana@minsa.gob');
  await user.type(screen.getByLabelText('Contraseña'), '12345678');
}

describe('UserFormDialog — alta (ESAVI-USER-001)', () => {
  it('crear con dos roles produce una sola llamada con roleId como array, y ninguna a /api/user-roles', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | null = null;
    let userRoleCalls = 0;
    server.use(
      http.post('http://localhost:4500/api/users', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: existingUser() });
      }),
      http.post('http://localhost:4500/api/user-roles/bulk', () => {
        userRoleCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.click(await screen.findByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('checkbox', { name: 'Usuario' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.roleId).toEqual([ROLE_ADMIN, ROLE_USER]);
    expect(body).not.toHaveProperty('roleIds');
    expect(userRoleCalls).toBe(0);
  });

  it('no envía displayName, isActive ni requiresPasswordChange', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/users', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: existingUser() });
      }),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.click(await screen.findByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).not.toHaveProperty('displayName');
    expect(body).not.toHaveProperty('isActive');
    expect(body).not.toHaveProperty('requiresPasswordChange');
  });

  it('un correo duplicado pinta el error bajo el campo y no en un toast', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/users', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe un usuario con ese correo',
            code: 'USER_001_EMAIL_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.click(await screen.findByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya existe un usuario con ese correo')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('un username duplicado marca el campo username', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/users', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe un usuario con ese nombre de usuario',
            code: 'USER_001_USERNAME_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.type(screen.getByLabelText('Nombre de usuario'), 'aperez');
    await user.click(await screen.findByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre de usuario')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('USER_001_ROLE_LEVEL_EXCEEDED se pinta en el bloque de roles', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/users', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'No puedes asignar un rol superior al tuyo',
            code: 'USER_001_ROLE_LEVEL_EXCEEDED',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.click(await screen.findByRole('checkbox', { name: 'Administrador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('No puedes asignar un rol superior al tuyo'),
    ).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('sin ningún rol marcado no se envía nada', async () => {
    const user = setupUser();
    let calls = 0;
    server.use(
      http.post('http://localhost:4500/api/users', () => {
        calls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: existingUser() });
      }),
    );

    renderDialog(null);
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
    expect(calls).toBe(0);
  });
});

describe('UserFormDialog — edición (ESAVI-USER-004)', () => {
  beforeEach(() => {
    server.use(
      http.get('http://localhost:4500/api/users/user-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: existingUser() }),
      ),
    );
  });

  it('no muestra contraseña ni selector de roles', async () => {
    renderDialog('user-1');

    expect(await screen.findByLabelText('Nombres')).toHaveValue('Ana');
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Administrador' })).not.toBeInTheDocument();
  });

  it('el PUT envía los cinco campos y ninguno de los que el backend rechaza', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('http://localhost:4500/api/users/user-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: existingUser() });
      }),
    );

    renderDialog('user-1');
    await screen.findByLabelText('Nombres');
    await user.clear(screen.getByLabelText('Teléfono'));
    await user.type(screen.getByLabelText('Teléfono'), '0988888888');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(Object.keys(body!).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
      'phone',
      'username',
    ]);
    expect(body!.phone).toBe('0988888888');
  });

  it('un USER_004_EMAIL_EXISTS marca el campo correo, no un toast', async () => {
    const user = setupUser();
    server.use(
      http.put('http://localhost:4500/api/users/user-1', () =>
        HttpResponse.json(
          { ok: false, message: 'Ese correo ya está en uso', code: 'USER_004_EMAIL_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderDialog('user-1');
    await screen.findByLabelText('Nombres');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ese correo ya está en uso')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });
});
