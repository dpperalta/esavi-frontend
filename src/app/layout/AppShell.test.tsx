import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { useUIStore } from '@/shared/stores/uiStore';
import { AppShell } from './AppShell';

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
  useUIStore.setState({ sidebarOpen: false });
  // useIsMobile reads window.innerWidth on mount — force the mobile branch so the sidebar
  // renders as a Sheet (dialog) instead of the desktop collapsible variant.
  window.innerWidth = 375;
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }] },
      }),
    ),
  );
});

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route
                path="/"
                element={
                  <div>
                    Home content
                    <Link to="/esavi-cases">Go to cases</Link>
                  </div>
                }
              />
              <Route path="/esavi-cases" element={<div>Cases content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell — drawer móvil', () => {
  it('se cierra al navegar', async () => {
    renderShell();

    useUIStore.getState().openSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);

    // "Inicio" ya apunta a la ruta actual (/) — no dispararía el efecto por cambio de ruta.
    // Se navega desde el contenido de la página a una ruta distinta.
    screen.getByText('Go to cases').click();

    await waitFor(() => expect(useUIStore.getState().sidebarOpen).toBe(false));
  });

  it('se cierra al presionar Escape', async () => {
    renderShell();

    useUIStore.getState().openSidebar();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await waitFor(() => expect(useUIStore.getState().sidebarOpen).toBe(false));
  });
});
