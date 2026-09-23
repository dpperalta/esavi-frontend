import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { HomePage } from '@/features/home/HomePage';
import { UserDetailPage } from '@/features/user/UserDetailPage';
import { UserListPage } from '@/features/user/UserListPage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { setupUser } from '@/test/user';
import { AppShell } from './layout/AppShell';

const server = setupServer();

const USER_ID = 'user-1';
const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';

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

function signInAs(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: 'me-1',
          displayName: 'Persona de prueba',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
    http.get('http://localhost:4500/api/users', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              userId: USER_ID,
              username: 'aperez',
              email: 'ana@minsa.gob',
              firstName: 'Ana',
              lastName: 'Pérez',
              displayName: 'Ana Pérez',
              phone: null,
              requiresPasswordChange: false,
              isActive: true,
              createdAt: '2026-09-01T10:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              roles: [{ roleId: ROLE_ADMIN, name: 'Administrador', code: 'ADMIN', level: 50 }],
            },
          ],
        },
      }),
    ),
  );
}

// Mirrors the real nesting of app/router.tsx: AppShell → RequireRole(ADMIN) → /users, /users/:id.
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<RequireRole level={ROLE_LEVELS.ADMIN} />}>
                <Route path="/users" element={<UserListPage />} />
                <Route path="/users/:id" element={<UserDetailPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /users — navegación desde el sidebar (SPEC FE20 §4 paso 11)', () => {
  it('la entrada del menú ya no está marcada como no disponible y navega', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Usuarios' });
    // `disabled: true` pintaba el ítem como «Próximamente» y sin enlace navegable. Otros ítems del
    // menú siguen marcados así, de ahí que se compruebe sobre este ítem y no sobre el menú entero.
    expect(link.textContent).not.toContain('Próximamente');
    await user.click(link);

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
  });
});

describe('Ruta /users — autorización', () => {
  it('con ADMIN, entrar por URL muestra el listado', async () => {
    signInAs('ADMIN', 50);

    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
  });

  it('con USER la entrada del menú no aparece', async () => {
    signInAs('USER', 25);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('con USER, entrar por URL redirige a / sin pantalla en blanco', async () => {
    signInAs('USER', 25);

    renderApp('/users');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('con ANALYTICS tampoco aparece ni se alcanza', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/users');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('la ficha /users/:id exige el mismo rol que el listado', async () => {
    signInAs('USER', 25);

    renderApp(`/users/${USER_ID}`);

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
  });
});
