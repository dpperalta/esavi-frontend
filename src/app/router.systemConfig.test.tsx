import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HomePage } from '@/features/home/HomePage';
import { SystemConfigListPage } from '@/features/systemConfig/SystemConfigListPage';
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
    http.get('http://localhost:4500/api/system-configs', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

// Mirrors the real nesting of app/router.tsx: AppShell → RequireRole(SUPERADMIN) → /system-configs.
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<RequireRole level={ROLE_LEVELS.SUPERADMIN} />}>
                <Route path="/system-configs" element={<SystemConfigListPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /system-configs — navegación desde el sidebar', () => {
  it('el enlace del sidebar navega a la pantalla de configuraciones', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Configuración del sistema' });
    await user.click(link);

    expect(
      await screen.findByRole('heading', { name: 'Configuraciones del sistema' }),
    ).toBeInTheDocument();
  });
});

describe('Ruta /system-configs — autorización (SPEC FE19 §2, §6: desviación declarada)', () => {
  it('con rol ADMIN la entrada del menú no aparece', async () => {
    signInAs('ADMIN', 50);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'Configuración del sistema' }),
    ).not.toBeInTheDocument();
  });

  it('con rol ADMIN, entrar por URL redirige a / sin pantalla en blanco', async () => {
    signInAs('ADMIN', 50);

    renderApp('/system-configs');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { name: 'Configuraciones del sistema' }),
    ).not.toBeInTheDocument();
  });

  it('con rol USER la entrada del menú tampoco aparece', async () => {
    signInAs('USER', 25);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'Configuración del sistema' }),
    ).not.toBeInTheDocument();
  });

  it('con rol SUPERADMIN entrar por URL sí muestra la pantalla', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/system-configs');

    expect(
      await screen.findByRole('heading', { name: 'Configuraciones del sistema' }),
    ).toBeInTheDocument();
  });
});
