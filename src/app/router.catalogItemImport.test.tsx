import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogItemImportPage } from '@/features/catalogItem/CatalogItemImportPage';
import { HomePage } from '@/features/home/HomePage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
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
  );
}

// Mirrors the SUPERADMIN group of app/router.tsx that holds /catalog-items/import (SPEC FE30 §3.1).
function renderApp(initialPath: string) {
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
                  <Route path="/catalog-items/import" element={<CatalogItemImportPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /catalog-items/import — autorización (SPEC FE30 §4 paso 5)', () => {
  it('sin sesión redirige al login', async () => {
    renderApp('/catalog-items/import');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });

  it('con ADMIN redirige a / sin pantalla en blanco', async () => {
    signInAs('ADMIN', 50);

    renderApp('/catalog-items/import');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { name: 'Importar elementos de catálogo' }),
    ).not.toBeInTheDocument();
  });

  it('con SUPERADMIN abre la página', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/catalog-items/import');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Importar elementos de catálogo' }),
    ).toBeInTheDocument();
  });

  it('la importación no tiene entrada de menú, ni siquiera con SUPERADMIN', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/');

    await screen.findByRole('link', { name: 'Elementos de catálogo' });
    expect(screen.queryByRole('link', { name: /importar/i })).not.toBeInTheDocument();
  });
});
