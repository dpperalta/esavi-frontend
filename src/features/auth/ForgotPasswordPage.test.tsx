import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordPage', () => {
  it('shows the same success screen for an email that exists', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/forgot-password', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: {} }),
      ),
    );

    renderPage();
    await user.type(screen.getByLabelText('auth.login.email'), 'existing@a.com');
    await user.click(screen.getByRole('button', { name: 'auth.forgot.submit' }));

    await waitFor(() => expect(screen.getByText('auth.forgot.sentTitle')).toBeInTheDocument());
  });

  it('shows the same success screen for an email that does not exist', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/auth/forgot-password', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: {} }),
      ),
    );

    renderPage();
    await user.type(screen.getByLabelText('auth.login.email'), 'nobody@a.com');
    await user.click(screen.getByRole('button', { name: 'auth.forgot.submit' }));

    await waitFor(() => expect(screen.getByText('auth.forgot.sentTitle')).toBeInTheDocument());
  });
});
