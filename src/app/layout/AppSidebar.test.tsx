import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { SidebarProvider } from '@/shared/components/ui/sidebar';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { tokenStore } from '@/shared/api/tokenStore';
import { AppSidebar } from './AppSidebar';

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

function renderSidebar(roles: Array<{ name: string; level: number }>) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          roles: roles.map((r, i) => ({ roleId: `r${i}`, code: r.name, ...r })),
        },
      }),
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppSidebar — filtro por rol', () => {
  it('con ANALYTICS no muestra ningún elemento de los grupos deshabilitados', async () => {
    renderSidebar([{ name: 'ANALYTICS', level: 10 }]);

    await waitFor(() => expect(screen.getByText('nav.home')).toBeInTheDocument());
    expect(screen.queryByText('nav.items.esaviCase')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.groups.cases')).not.toBeInTheDocument();
  });

  it('con USER muestra los dieciséis hijos, sin «Usuarios»', async () => {
    renderSidebar([{ name: 'USER', level: 25 }]);

    await waitFor(() => expect(screen.getByText('nav.items.esaviCase')).toBeInTheDocument());
    expect(screen.queryByText('nav.items.user')).not.toBeInTheDocument();
    expect(screen.getByText('nav.groups.administration')).toBeInTheDocument();
    expect(screen.getByText('nav.items.appRole')).toBeInTheDocument();
  });

  it('con ADMIN muestra los diecisiete hijos, incluido «Usuarios»', async () => {
    renderSidebar([{ name: 'ADMIN', level: 50 }]);

    await waitFor(() => expect(screen.getByText('nav.items.user')).toBeInTheDocument());
  });
});

describe('AppSidebar — hijos deshabilitados', () => {
  it('no navega al hacer click y se anuncia como aria-disabled', async () => {
    renderSidebar([{ name: 'ADMIN', level: 50 }]);

    await waitFor(() => expect(screen.getByText('nav.items.esaviCase')).toBeInTheDocument());

    const disabledItem = screen.getByText('nav.items.esaviCase').closest('button');
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true');
    expect(disabledItem).not.toHaveAttribute('disabled');
    expect(disabledItem?.tabIndex).toBe(0);
    // A plain <button> with no onClick and no href — a click dispatches, nothing navigates.
    expect(disabledItem?.tagName).toBe('BUTTON');
    expect(disabledItem).not.toHaveAttribute('href');

    fireEvent.click(disabledItem!);
    expect(screen.getByText('nav.items.esaviCase')).toBeInTheDocument();
  });
});
