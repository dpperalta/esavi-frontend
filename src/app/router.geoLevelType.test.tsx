import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GeoLevelTypeListPage } from '@/features/geoLevelType/GeoLevelTypeListPage';
import { HomePage } from '@/features/home/HomePage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
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
          userId: '1',
          displayName: 'Persona de prueba',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// Mirrors the real nesting of app/router.tsx: AppShell → RequireRole(USER) → /geo-level-types.
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
                <Route path="/geo-level-types" element={<GeoLevelTypeListPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /geo-level-types — navegación desde el sidebar', () => {
  it('el enlace del sidebar navega a la pantalla de niveles geográficos', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Niveles geográficos' });
    await user.click(link);

    expect(
      await screen.findByRole('heading', { name: 'Niveles geográficos' }),
    ).toBeInTheDocument();
  }, 20000);
});

describe('Ruta /geo-level-types — autorización', () => {
  it('con rol ANALYTICS la entrada del menú no aparece', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Niveles geográficos' })).not.toBeInTheDocument();
  });

  it('con rol ANALYTICS, entrar por URL redirige a / sin pantalla en blanco', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/geo-level-types');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Niveles geográficos' })).not.toBeInTheDocument();
  });
});
