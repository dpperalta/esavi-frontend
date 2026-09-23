import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { AppRoleHoldersSheet } from './AppRoleHoldersSheet';

const server = setupServer();

const ROLE_ID = 'role-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function mockHolders(rows: unknown[], count = rows.length) {
  server.use(
    http.get(`http://localhost:4500/api/user-roles/role/${ROLE_ID}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count,
          role: { roleId: ROLE_ID, code: 'SUPERVISOR', name: 'SUPERVISOR', level: 60 },
          rows,
        },
      }),
    ),
  );
}

function makeHolder(overrides: Record<string, unknown> = {}) {
  return {
    userRoleId: 'ur-1',
    userId: 'user-1',
    roleId: ROLE_ID,
    assignedByUserId: null,
    isActive: true,
    user: {
      userId: 'user-1',
      username: 'aperez',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@minsa.gob',
    },
    ...overrides,
  };
}

function renderSheet(roleId: string | null = ROLE_ID) {
  const router = createMemoryRouter(
    [
      {
        path: '/roles',
        element: <AppRoleHoldersSheet open roleId={roleId} onOpenChange={() => {}} />,
      },
      { path: '/users/:id', element: <p>ficha</p> },
    ],
    { initialEntries: ['/roles'] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('AppRoleHoldersSheet', () => {
  it('lista los portadores con su nombre y correo descifrados', async () => {
    mockHolders([makeHolder()]);

    renderSheet();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('ana@minsa.gob')).toBeInTheDocument();
  });

  it('cada fila enlaza a la ficha de FE20', async () => {
    mockHolders([makeHolder()]);

    renderSheet();

    const link = await screen.findByRole('link', { name: /Ana Pérez/ });
    expect(link).toHaveAttribute('href', '/users/user-1');
  });

  it('un rol sin portadores muestra el vacío, no un error', async () => {
    mockHolders([]);

    renderSheet();

    expect(await screen.findByText('Nadie porta este rol.')).toBeInTheDocument();
  });

  it('cae al usuario o al correo cuando no hay nombre', async () => {
    mockHolders([makeHolder({ user: { ...makeHolder().user, firstName: null, lastName: null } })]);

    renderSheet();

    expect(await screen.findByRole('link', { name: /aperez/ })).toBeInTheDocument();
  });

  it('no pide nada sin rol', async () => {
    renderSheet(null);

    expect(await screen.findByText('Nadie porta este rol.')).toBeInTheDocument();
  });
});
