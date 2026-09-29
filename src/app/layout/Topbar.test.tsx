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
import { i18next } from '@/shared/config/i18n';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useDraftsStore } from '@/shared/stores/draftsStore';
import { Topbar } from './Topbar';

// Topbar imports errorMessages, which initializes the real i18next: labels render translated, so
// names are resolved from their key instead of asserting the raw key.
const label = (key: string) => i18next.t(key);

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
  render(
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
  return { queryClient };
}

async function openSessionMenuEntry(user: ReturnType<typeof setupUser>, entry: string) {
  await user.click(screen.getByRole('button', { name: label('shell.sessionMenu.trigger') }));
  await user.click(await screen.findByRole('menuitem', { name: entry }));
}

function mockCurrentUser(level: number) {
  return http.get('http://localhost:4500/api/users/me', () =>
    HttpResponse.json({
      ok: true,
      message: 'ok',
      data: {
        userId: '1',
        displayName: 'Alguien',
        roles: [{ roleId: 'r1', name: 'Rol', code: 'ROLE', level }],
      },
    }),
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

    await openSessionMenuEntry(user, label('auth.session.logout'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: label('auth.session.logout') }));

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

    await openSessionMenuEntry(user, label('auth.session.logout'));
    await waitFor(() => expect(screen.getByText(label('auth.session.logoutConfirm'))).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: label('common.actions.cancel') }));

    await waitFor(() =>
      expect(screen.queryByText(label('auth.session.logoutConfirm'))).not.toBeInTheDocument(),
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

    await openSessionMenuEntry(user, label('auth.session.logout'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: label('auth.session.logout') }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(tokenStore.getRefreshToken()).toBeNull();
  });
});

describe('Topbar — logout-all', () => {
  beforeEach(() => {
    useDraftsStore.getState().set('case-1', 'notification', { esaviDescription: 'x' }, null);
  });
  afterEach(() => {
    useDraftsStore.getState().clearAll();
  });

  it('revoca todas las sesiones, limpia la sesión local y navega a /login', async () => {
    const user = setupUser();
    let logoutAllCalls = 0;

    server.use(
      mockCurrentUser(ROLE_LEVELS.USER),
      http.post('http://localhost:4500/api/auth/logout-all', () => {
        logoutAllCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { revokedCount: 3 } });
      }),
    );

    const { queryClient } = renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await openSessionMenuEntry(user, label('auth.session.logoutAll'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(label('auth.session.logoutAllConfirm'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: label('auth.session.logoutAll') }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(logoutAllCalls).toBe(1);
    expect(tokenStore.getRefreshToken()).toBeNull();
    expect(useDraftsStore.getState().drafts).toEqual({});
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('no toca la sesión local si la petición falla', async () => {
    const user = setupUser();

    server.use(
      mockCurrentUser(ROLE_LEVELS.USER),
      http.post('http://localhost:4500/api/auth/logout-all', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Error',
            code: 'AUTH_004_LOGOUT_ALL_FAILED',
            errors: 'Internal server error',
          },
          { status: 500 },
        ),
      ),
    );

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await openSessionMenuEntry(user, label('auth.session.logoutAll'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: label('auth.session.logoutAll') }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(tokenStore.getRefreshToken()).toBe('a-refresh-token');
    expect(useDraftsStore.getState().get('case-1', 'notification')).toBeDefined();
  });

  it('no ofrece «Cerrar todas las sesiones» a ANALYTICS', async () => {
    const user = setupUser();
    server.use(mockCurrentUser(ROLE_LEVELS.ANALYTICS));

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: label('shell.sessionMenu.trigger') }));
    expect(await screen.findByRole('menuitem', { name: label('auth.session.logout') })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: label('auth.session.logoutAll') })).toBeNull();
  });

  it('deshabilita la acción mientras la petición está en vuelo', async () => {
    const user = setupUser();
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      mockCurrentUser(ROLE_LEVELS.USER),
      http.post('http://localhost:4500/api/auth/logout-all', async () => {
        await pending;
        return HttpResponse.json({ ok: true, message: 'ok', data: { revokedCount: 1 } });
      }),
    );

    renderTopbar();
    await waitFor(() => expect(screen.getByText('Alguien')).toBeInTheDocument());

    await openSessionMenuEntry(user, label('auth.session.logoutAll'));
    const dialog = await screen.findByRole('alertdialog');
    const action = within(dialog).getByRole('button', { name: label('auth.session.logoutAll') });
    await user.click(action);

    await waitFor(() => expect(action).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: label('common.actions.cancel') })).toBeDisabled();
    // The open AlertDialog marks the rest of the page aria-hidden.
    expect(
      screen.getByRole('button', { name: label('shell.sessionMenu.trigger'), hidden: true }),
    ).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
  });
});
