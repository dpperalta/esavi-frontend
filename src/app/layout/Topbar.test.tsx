import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { SidebarProvider } from '@/shared/components/ui/sidebar';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { tokenStore } from '@/shared/api/tokenStore';
import { Topbar } from './Topbar';

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

function renderTopbar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider>
          <SidebarProvider>
            <Routes>
              <Route path="/" element={<Topbar />} />
              <Route path="/login" element={<div>Login page</div>} />
            </Routes>
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Topbar — logout', () => {
  it('revoca la sesión, limpia los tokens y navega a /login', async () => {
    const user = setupUser();
    let logoutRequestBody: unknown = null;

    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', displayName: 'Alguien', roles: [] },
        }),
      ),
      http.post('http://localhost:4500/api/auth/logout', async ({ request }) => {
        logoutRequestBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'auth.session.logout' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'auth.session.logout' }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(logoutRequestBody).toEqual({ refreshToken: 'a-refresh-token' });
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('no cierra la sesión si se cancela la confirmación', async () => {
    const user = setupUser();
    let logoutCalled = false;

    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', displayName: 'Alguien', roles: [] },
        }),
      ),
      http.post('http://localhost:4500/api/auth/logout', () => {
        logoutCalled = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'auth.session.logout' }));
    await waitFor(() => expect(screen.getByText('auth.session.logoutConfirm')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'common.actions.cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('auth.session.logoutConfirm')).not.toBeInTheDocument(),
    );
    expect(logoutCalled).toBe(false);
    expect(tokenStore.getRefreshToken()).toBe('a-refresh-token');
  });

  it('limpia la sesión localmente aunque la petición falle', async () => {
    const user = setupUser();

    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', displayName: 'Alguien', roles: [] },
        }),
      ),
      http.post('http://localhost:4500/api/auth/logout', () => HttpResponse.error()),
    );

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'auth.session.logout' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'auth.session.logout' }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(tokenStore.getRefreshToken()).toBeNull();
  });
});
