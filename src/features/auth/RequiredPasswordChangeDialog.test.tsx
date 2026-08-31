import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequiredPasswordChangeDialog } from './RequiredPasswordChangeDialog';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
});

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequiredPasswordChangeDialog />
    </QueryClientProvider>,
  );
}

describe('RequiredPasswordChangeDialog', () => {
  it('no aparece cuando requiresPasswordChange es false', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', requiresPasswordChange: false, roles: [] },
        }),
      ),
    );

    renderDialog();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('aparece sin botón de cerrar y no se cierra con Escape', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', requiresPasswordChange: true, roles: [] },
        }),
      ),
    );

    renderDialog();

    const dialog = await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Sigue montado: la prevención de onEscapeKeyDown funcionó.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("se cierra sola cuando el PATCH invalida ['user','me'] y éste vuelve con requiresPasswordChange en false — sin ningún setOpen", async () => {
    const user = userEvent.setup();
    let requiresPasswordChange = true;
    let patchBody: unknown = null;

    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', requiresPasswordChange, roles: [] },
        }),
      ),
      http.patch('http://localhost:4500/api/users/me/password', async ({ request }) => {
        patchBody = await request.json();
        requiresPasswordChange = false;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderDialog();

    await screen.findByRole('dialog');

    await user.type(screen.getByLabelText('auth.changePassword.current'), 'old-password');
    await user.type(screen.getByLabelText('auth.changePassword.new'), 'a-new-password');
    await user.type(screen.getByLabelText('auth.changePassword.confirm'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'auth.changePassword.submit' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(patchBody).toEqual({ currentPassword: 'old-password', newPassword: 'a-new-password' });
  });

  it('USER_006_SAME_PASSWORD muestra el error bajo newPassword', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', requiresPasswordChange: true, roles: [] },
        }),
      ),
      http.patch('http://localhost:4500/api/users/me/password', () =>
        HttpResponse.json(
          { ok: false, message: 'Contraseña repetida', code: 'USER_006_SAME_PASSWORD' },
          { status: 409 },
        ),
      ),
    );

    renderDialog();
    await screen.findByRole('dialog');

    await user.type(screen.getByLabelText('auth.changePassword.current'), 'same-password');
    await user.type(screen.getByLabelText('auth.changePassword.new'), 'same-password');
    await user.type(screen.getByLabelText('auth.changePassword.confirm'), 'same-password');
    await user.click(screen.getByRole('button', { name: 'auth.changePassword.submit' }));

    const newPasswordField = await screen.findByLabelText('auth.changePassword.new');
    expect(newPasswordField).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('auth.changePassword.samePassword')).toBeInTheDocument();
    // The required dialog stays open: the password never actually changed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
