import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { ChangePasswordDialog } from './ChangePasswordDialog';

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
      <ChangePasswordDialog />
    </QueryClientProvider>,
  );
}

describe('ChangePasswordDialog', () => {
  it('está cerrado hasta que se abre desde el disparador', async () => {
    renderDialog();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'auth.changePassword.title' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('se cierra al presionar Escape (es descartable)', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'auth.changePassword.title' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('se cierra tras un cambio exitoso', async () => {
    const user = setupUser();
    server.use(
      http.patch('http://localhost:4500/api/users/me/password', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: {} }),
      ),
    );

    renderDialog();
    await user.click(screen.getByRole('button', { name: 'auth.changePassword.title' }));

    await user.type(screen.getByLabelText('auth.changePassword.current'), 'old-password');
    await user.type(screen.getByLabelText('auth.changePassword.new'), 'a-new-password');
    await user.type(screen.getByLabelText('auth.changePassword.confirm'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'auth.changePassword.submit' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
