import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function renderPage(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<div>Forgot password page</div>} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResetPasswordPage', () => {
  it('shows the invalid-link state without ?token=, with a way to /forgot-password', async () => {
    const user = setupUser();
    renderPage('/reset-password');

    expect(screen.getByText('auth.reset.invalidLink')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'auth.reset.requestNew' }));

    await waitFor(() => expect(screen.getByText('Forgot password page')).toBeInTheDocument());
  });

  it('resets the password with a valid token and shows the success state', async () => {
    const user = setupUser();
    let requestBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/auth/reset-password', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderPage('/reset-password?token=a-valid-token');

    await user.type(screen.getByLabelText('auth.reset.newPassword'), 'a-new-password');
    await user.type(screen.getByLabelText('auth.reset.confirmPassword'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'auth.reset.submit' }));

    await waitFor(() => expect(screen.getByText('auth.reset.success')).toBeInTheDocument());
    expect(requestBody).toEqual({ token: 'a-valid-token', newPassword: 'a-new-password' });
  });

  it('shows a mismatch error under confirmPassword when the two passwords differ', async () => {
    const user = setupUser();
    renderPage('/reset-password?token=a-valid-token');

    await user.type(screen.getByLabelText('auth.reset.newPassword'), 'a-new-password');
    await user.type(screen.getByLabelText('auth.reset.confirmPassword'), 'something-else');
    await user.click(screen.getByRole('button', { name: 'auth.reset.submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('auth.passwordMismatch');
  });

  it.each([
    'AUTH_007_INVALID_RESET_TOKEN',
    'AUTH_007_RESET_TOKEN_USED',
    'AUTH_007_RESET_TOKEN_INVALIDATED',
    'AUTH_007_RESET_TOKEN_EXPIRED',
  ])('switches to the invalid-link state when the backend rejects with %s', async (code) => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/reset-password', () =>
        HttpResponse.json({ ok: false, message: 'Enlace inválido', code }, { status: 401 }),
      ),
    );

    renderPage('/reset-password?token=a-used-token');

    await user.type(screen.getByLabelText('auth.reset.newPassword'), 'a-new-password');
    await user.type(screen.getByLabelText('auth.reset.confirmPassword'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'auth.reset.submit' }));

    await waitFor(() => expect(screen.getByText('auth.reset.invalidLink')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'auth.reset.requestNew' })).toBeInTheDocument();
  });
});
