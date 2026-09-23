import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { User, UserListRow } from '@/contracts/declared/user';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { UserListPage } from './UserListPage';

const server = setupServer();

const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';

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

function signInAs(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function makeRow(overrides: Partial<User> = {}): UserListRow {
  return {
    userId: 'user-1',
    username: 'aperez',
    email: 'ana@minsa.gob',
    firstName: 'Ana',
    lastName: 'Pérez',
    displayName: 'Ana Pérez',
    phone: '0999999999',
    requiresPasswordChange: true,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    roles: [{ roleId: ROLE_ADMIN, name: 'Administrador', code: 'ADMIN', level: 50 }],
    ...overrides,
  };
}

function mockListing(rows: UserListRow[] = [makeRow()]) {
  server.use(
    http.get('http://localhost:4500/api/users', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function renderPage(initialPath = '/users') {
  const router = createMemoryRouter(
    [
      { path: '/users', element: <UserListPage /> },
      { path: '/users/:id', element: <p>ficha</p> },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('UserListPage — el listado', () => {
  it('pinta las columnas de §3.8 y el nombre como enlace a la ficha', async () => {
    signInAs('ADMIN', 50);
    mockListing();

    renderPage();

    const link = await screen.findAllByRole('link', { name: 'Ana Pérez' });
    expect(link[0]).toHaveAttribute('href', '/users/user-1');
    expect(screen.getAllByText('ana@minsa.gob').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0);
    expect(screen.getAllByText('01/09/2026').length).toBeGreaterThan(0);
  });

  it('no ofrece ningún control de ordenación: createdAt DESC es el único orden posible', async () => {
    signInAs('ADMIN', 50);
    mockListing();

    renderPage();

    await screen.findAllByRole('link', { name: 'Ana Pérez' });
    expect(screen.queryByRole('button', { name: /Nombre/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /ordenar/i })).not.toBeInTheDocument();
  });

  it('una fila inactiva lleva el badge Inactivo', async () => {
    signInAs('ADMIN', 50);
    mockListing([makeRow({ isActive: false })]);

    renderPage();

    expect((await screen.findAllByText('Inactivo')).length).toBeGreaterThan(0);
  });

  it('con ADMIN ofrece «Crear usuario»; con USER no', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    renderPage();
    expect((await screen.findAllByRole('button', { name: 'Crear usuario' })).length).toBe(1);
  });

  it('la acción de auditoría sólo existe con SUPERADMIN', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockListing();

    renderPage();

    await screen.findAllByRole('link', { name: 'Ana Pérez' });
    const menus = screen.getAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN la acción de auditoría abre el historial, que lee la ficha (003)', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);
    mockListing();
    let detailCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/users/user-1', () => {
        detailCalls += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { ...makeRow(), appDetails: [] },
        });
      }),
    );

    renderPage();

    await screen.findAllByRole('link', { name: 'Ana Pérez' });
    const menus = screen.getAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Ver auditoría' }));

    await waitFor(() => expect(detailCalls).toBe(1));
  });
});

describe('UserListPage — el buscador (ESAVI-USER-008)', () => {
  it('teclear un carácter no llama al backend ni escribe q en la URL', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockListing();
    let searchCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/users/search', () => {
        searchCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const router = renderPage();
    await screen.findAllByRole('link', { name: 'Ana Pérez' });

    await user.type(screen.getByLabelText('Buscar usuario'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(searchCalls).toBe(0);
    expect(
      new URL(`http://x${router.state.location.search}`, 'http://x').searchParams.get('q'),
    ).toBeNull();
  });

  it('teclear dos caracteres escribe q y llama una sola vez tras el debounce', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockListing();
    let searchCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/users/search', () => {
        searchCalls += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeRow()] },
        });
      }),
    );

    const router = renderPage();
    await screen.findAllByRole('link', { name: 'Ana Pérez' });

    await user.type(screen.getByLabelText('Buscar usuario'), 'pe');

    await waitFor(() => expect(searchCalls).toBe(1));
    expect(router.state.location.search).toContain('q=pe');
    // Un solo viaje por término, no uno por tecla.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(searchCalls).toBe(1);
  });

  it('buscar apaga el toggle de inactivos y lo borra de searchParams', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    server.use(
      http.get('http://localhost:4500/api/users/admin', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
      http.get('http://localhost:4500/api/users', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    const router = renderPage('/users?includeInactive=true');
    await screen.findAllByRole('link', { name: 'Ana Pérez' });
    expect(router.state.location.search).toContain('includeInactive=true');

    await user.type(screen.getByLabelText('Buscar usuario'), 'pe');

    await waitFor(() => expect(router.state.location.search).toContain('q=pe'));
    expect(router.state.location.search).not.toContain('includeInactive');
  });

  it('un término sin coincidencias pinta el vacío de búsqueda, no un error', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    server.use(
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage('/users?q=zzz');

    expect(await screen.findByText(/Ningún usuario coincide con la búsqueda/)).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar los datos.')).not.toBeInTheDocument();
  });

  it('un 400 USER_008_QUERY_REQUIRED se pinta bajo el campo y nunca como «sin resultados»', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    server.use(
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json(
          { ok: false, message: 'Search query is required', code: 'USER_008_QUERY_REQUIRED' },
          { status: 400 },
        ),
      ),
    );

    renderPage('/users?q=..');

    expect(
      await screen.findByText('Escribe al menos una palabra que se pueda buscar.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ningún usuario coincide con la búsqueda/)).not.toBeInTheDocument();
  });

  it('un enlace con q, page y el término reproduce la vista sin tocar el campo', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    let receivedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/users/search', ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeRow()] },
        });
      }),
    );

    renderPage('/users?q=pe&page=3');

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('q')).toBe('pe');
    expect(receivedUrl!.searchParams.get('offset')).toBe('20');
    expect(screen.getByLabelText('Buscar usuario')).toHaveValue('pe');
  });

  it('anuncia el número de resultados en una región viva', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    server.use(
      http.get('http://localhost:4500/api/users/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage('/users?q=pe');

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 usuarios encontrados'),
    );
  });
});
