import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HomePage } from '@/features/home/HomePage';
import { WhodrugProductListPage } from '@/features/whodrugProduct/WhodrugProductListPage';
import { WhodrugProductSyncPage } from '@/features/whodrugProduct/WhodrugProductSyncPage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { setupUser } from '@/test/user';
import { AppShell } from './layout/AppShell';

const API = 'http://localhost:4500/api';
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
    http.get(`${API}/users/me`, () =>
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
    http.get(`${API}/whodrug-products/admin`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// Mirrors the real nesting and order of app/router.tsx: /whodrug-products/sync in the SUPERADMIN
// group, declared before the second ADMIN group that holds /whodrug-products (SPEC FE25d §3.1).
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
                <Route element={<RequireRole level={ROLE_LEVELS.SUPERADMIN} />}>
                  <Route path="/whodrug-products/sync" element={<WhodrugProductSyncPage />} />
                </Route>
                <Route element={<RequireRole level={ROLE_LEVELS.ADMIN} />}>
                  <Route path="/whodrug-products" element={<WhodrugProductListPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /whodrug-products — navegación desde el sidebar (SPEC FE25d §4 paso 9)', () => {
  it('con USER, el ítem «Medicamentos WHODrug» no aparece', async () => {
    signInAs('USER', 25);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Medicamentos WHODrug' })).not.toBeInTheDocument();
  });

  it('con ADMIN, el ítem aparece y lleva al listado', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);

    renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Medicamentos WHODrug' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Medicamentos WHODrug' }),
    ).toBeInTheDocument();
  });

  it('la sincronización no tiene entrada de menú, ni siquiera con SUPERADMIN', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/');

    await screen.findByRole('link', { name: 'Medicamentos WHODrug' });
    expect(screen.queryByRole('link', { name: /sincronizar/i })).not.toBeInTheDocument();
  });
});

describe('Rutas /whodrug-products/* — autorización (SPEC FE25d §4 paso 9)', () => {
  it('sin sesión redirige al login', async () => {
    renderApp('/whodrug-products');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });

  it('con USER, /whodrug-products redirige a / sin pantalla en blanco', async () => {
    signInAs('USER', 25);

    renderApp('/whodrug-products');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Medicamentos WHODrug' }),
    ).not.toBeInTheDocument();
  });

  it('con ADMIN, /whodrug-products/sync redirige a /', async () => {
    signInAs('ADMIN', 50);

    renderApp('/whodrug-products/sync');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Sincronizar con WHODrug' }),
    ).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, /whodrug-products abre el listado', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/whodrug-products');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Medicamentos WHODrug' }),
    ).toBeInTheDocument();
  });

  it('con SUPERADMIN, /whodrug-products/sync abre la sincronización', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/whodrug-products/sync');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sincronizar con WHODrug' }),
    ).toBeInTheDocument();
  });
});
