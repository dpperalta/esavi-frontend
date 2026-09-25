import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DiluentListPage } from '@/features/diluent/DiluentListPage';
import { HomePage } from '@/features/home/HomePage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { AppShell } from './layout/AppShell';

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

function signInAs(roleName: string, level: number) {
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          displayName: 'Persona de prueba',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
    http.get('http://localhost:4500/api/diluents', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// Mirrors the real nesting of app/router.tsx: RequireAuth → AppShell → RequireRole(USER).
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>login-screen</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
                  <Route path="/diluents" element={<DiluentListPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /diluents — navegación desde el sidebar', () => {
  it('con USER, el ítem ya no dice «Próximamente» y lleva a la pantalla de diluyentes', async () => {
    const user = setupUser();
    signInAs('USER', 25);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Diluyentes' });
    expect(link).not.toHaveTextContent('Próximamente');
    await user.click(link);

    expect(await screen.findByRole('heading', { name: 'Diluyentes' })).toBeInTheDocument();
  });
});

describe('Ruta /diluents — autorización', () => {
  it('sin sesión redirige al login', async () => {
    renderApp('/diluents');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });

  it('con ANALYTICS la entrada del menú no aparece', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Diluyentes' })).not.toBeInTheDocument();
  });

  it('con ANALYTICS, entrar por URL redirige a / sin pantalla en blanco', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/diluents');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Diluyentes' })).not.toBeInTheDocument();
  });
});
