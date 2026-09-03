import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GeoBulkImportPage } from '@/features/geoLocation/GeoBulkImportPage';
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
  );
}

// Mirrors the real nesting of app/router.tsx: AppShell → RequireRole(ADMIN) → /geo-locations/import.
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
                <Route path="/geo-locations/import" element={<GeoBulkImportPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /geo-locations/import — navegación desde el sidebar', () => {
  it('el enlace del sidebar navega a la pantalla de carga masiva', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Carga masiva de geografía' });
    await user.click(link);

    expect(
      await screen.findByRole('heading', { name: 'Carga masiva de geografía' }),
    ).toBeInTheDocument();
  });
});

describe('Ruta /geo-locations/import — autorización', () => {
  it('con rol USER la entrada del menú no aparece', async () => {
    signInAs('USER', 25);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'Carga masiva de geografía' }),
    ).not.toBeInTheDocument();
  });

  it('con rol USER, entrar por URL redirige a / sin pantalla en blanco', async () => {
    signInAs('USER', 25);

    renderApp('/geo-locations/import');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { name: 'Carga masiva de geografía' }),
    ).not.toBeInTheDocument();
  });

  it('con rol ADMIN, entrar por URL muestra la pantalla', async () => {
    signInAs('ADMIN', 50);

    renderApp('/geo-locations/import');

    expect(
      await screen.findByRole('heading', { name: 'Carga masiva de geografía' }),
    ).toBeInTheDocument();
  });
});
