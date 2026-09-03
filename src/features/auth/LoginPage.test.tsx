import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { LoginPage } from './LoginPage';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function renderLoginPage(initialPath = '/login') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/protected" element={<div>Protected page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('logs in with valid credentials and lands on /', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/login', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            token: 'a-token',
            refreshToken: 'a-refresh-token',
            expiresAt: '2026-01-01T00:00:00Z',
            user: { userId: '1', email: 'a@a.com', displayName: 'A', roles: [] },
          },
        }),
      ),
    );

    renderLoginPage();

    await user.type(screen.getByLabelText('auth.login.email'), 'a@a.com');
    await user.type(screen.getByLabelText('auth.login.password'), 'a-password');
    await user.click(screen.getByRole('button', { name: 'auth.login.submit' }));

    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
    expect(tokenStore.getRefreshToken()).toBe('a-refresh-token');
  });

  it('returns to the pretended route after logging in', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/login', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            token: 'a-token',
            refreshToken: 'a-refresh-token',
            expiresAt: '2026-01-01T00:00:00Z',
            user: { userId: '1', email: 'a@a.com', displayName: 'A', roles: [] },
          },
        }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[{ pathname: '/login', state: { from: { pathname: '/protected' } } }]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Home</div>} />
            <Route path="/protected" element={<div>Protected page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText('auth.login.email'), 'a@a.com');
    await user.type(screen.getByLabelText('auth.login.password'), 'a-password');
    await user.click(screen.getByRole('button', { name: 'auth.login.submit' }));

    await waitFor(() => expect(screen.getByText('Protected page')).toBeInTheDocument());
  });

  it('shows the error under the form on invalid credentials, without naming which field failed', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/login', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Credenciales inválidas',
            code: 'AUTH_001_INVALID_CREDENTIALS',
          },
          { status: 401 },
        ),
      ),
    );

    renderLoginPage();

    await user.type(screen.getByLabelText('auth.login.email'), 'a@a.com');
    await user.type(screen.getByLabelText('auth.login.password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'auth.login.submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('auth.login.invalidCredentials');
    expect(screen.getByLabelText('auth.login.email')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('auth.login.password')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    // Stays on the login screen; no session was created.
    expect(screen.getByRole('button', { name: 'auth.login.submit' })).toBeInTheDocument();
  });

  it('redirects away from /login when a session already exists', async () => {
    tokenStore.setRefreshToken('a-refresh-token');
    setAccessToken('a-token');
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { userId: '1', roles: [] } }),
      ),
    );

    renderLoginPage();

    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
  });
});
