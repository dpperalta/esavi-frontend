import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { AppRoleFormDialog } from './AppRoleFormDialog';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
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

function renderDialog(roleId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppRoleFormDialog open roleId={roleId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

async function fillValidRole(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText('Código'), 'supervisor');
  await user.type(screen.getByLabelText('Nombre'), 'supervisor de zona');
  await user.type(screen.getByLabelText('Descripción'), 'Supervisa una zona');
  await user.type(screen.getByLabelText('Nivel'), '40');
}

describe('AppRoleFormDialog — vista previa de la normalización', () => {
  it('muestra SUPERVISOR_DE_ZONA mientras se teclea el nombre', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();

    renderDialog();
    await user.type(await screen.findByLabelText('Nombre'), 'supervisor de zona');

    expect(await screen.findByText('Se guardará como SUPERVISOR_DE_ZONA')).toBeInTheDocument();
  });

  it('avisa de que una tilde se pierde, que es justo lo que no se ve al guardar', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();

    renderDialog();
    await user.type(await screen.findByLabelText('Código'), 'coordinación');

    expect(await screen.findByText('Se guardará como COORDINACI_N')).toBeInTheDocument();
  });
});

describe('AppRoleFormDialog — el alta', () => {
  it('no envía isSystemRole, isActive ni roleId', async () => {
    signInAs('ADMIN', 50);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/roles', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );
    const user = setupUser();

    renderDialog();
    await screen.findByLabelText('Código');
    await fillValidRole(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(Object.keys(body!).sort()).toEqual(['code', 'description', 'level', 'name']);
    expect(body!.level).toBe(40);
  });

  it('pinta un código duplicado bajo el campo, no en un toast', async () => {
    signInAs('ADMIN', 50);
    server.use(
      http.post('http://localhost:4500/api/roles', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe un rol con el código SUPERVISOR.',
            code: 'APPROLE_001_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );
    const user = setupUser();

    renderDialog();
    await screen.findByLabelText('Código');
    await fillValidRole(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const message = await screen.findByText('Ya existe un rol con el código SUPERVISOR.');
    expect(message).toBeInTheDocument();
    // Under the field, inside the same FormItem as the input — not floating in a toast.
    expect(message.closest('[data-slot="form-item"]')).toContainElement(
      screen.getByLabelText('Código'),
    );
  });

  it('pinta un 403 de nivel excedido bajo el campo de nivel', async () => {
    signInAs('ADMIN', 50);
    server.use(
      http.post('http://localhost:4500/api/roles', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'No puedes crear un rol por encima de tu propio nivel.',
            code: 'APPROLE_001_LEVEL_EXCEEDED',
          },
          { status: 403 },
        ),
      ),
    );
    const user = setupUser();

    renderDialog();
    await screen.findByLabelText('Código');
    await fillValidRole(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const message = await screen.findByText(
      'No puedes crear un rol por encima de tu propio nivel.',
    );
    expect(message.closest('[data-slot="form-item"]')).toContainElement(
      screen.getByLabelText('Nivel'),
    );
  });
});

describe('AppRoleFormDialog — la edición', () => {
  it('parte de la fila y envía el objeto completo: el diff es del backend', async () => {
    signInAs('SUPERADMIN', 100);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get('http://localhost:4500/api/roles/role-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            roleId: 'role-1',
            code: 'SUPERVISOR',
            name: 'SUPERVISOR',
            description: 'Supervisa una zona',
            level: 60,
            isSystemRole: false,
            isActive: true,
            activeUserCount: 0,
          },
        }),
      ),
      http.put('http://localhost:4500/api/roles/role-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );
    const user = setupUser();

    renderDialog('role-1');

    expect(await screen.findByText('Editar rol')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue('SUPERVISOR'));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      code: 'SUPERVISOR',
      name: 'SUPERVISOR',
      description: 'Supervisa una zona',
      level: 60,
    });
  });
});
