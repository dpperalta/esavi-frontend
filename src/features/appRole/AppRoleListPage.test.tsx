import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { AppRole } from '@/contracts/declared/appRole';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { AppRoleListPage } from './AppRoleListPage';

const server = setupServer();

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

function makeRole(overrides: Partial<AppRole> = {}): AppRole {
  return {
    roleId: 'role-1',
    code: 'SUPERVISOR',
    name: 'SUPERVISOR',
    description: 'Supervisa una zona',
    level: 60,
    isSystemRole: false,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: null,
    ...overrides,
  };
}

// Records every GET of both listings, so a test can assert how many requests a term produced
// and with which parameters.
function mockListing(rows: AppRole[] = [makeRole()]) {
  const calls: URL[] = [];
  const handler = ({ request }: { request: Request }) => {
    calls.push(new URL(request.url));
    return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
  };
  server.use(
    http.get('http://localhost:4500/api/roles', handler),
    http.get('http://localhost:4500/api/roles/admin', handler),
  );
  return calls;
}

function renderPage(initialPath = '/roles') {
  const router = createMemoryRouter([{ path: '/roles', element: <AppRoleListPage /> }], {
    initialEntries: [initialPath],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('AppRoleListPage — el listado', () => {
  it('pinta el nivel con su nombre conocido, y sólo el número cuando no lo hay', async () => {
    signInAs('ADMIN', 50);
    mockListing([
      makeRole(),
      makeRole({ roleId: 'role-2', code: 'ADMIN', name: 'ADMIN', level: 50 }),
    ]);

    renderPage();

    expect((await screen.findAllByText('50 · ADMIN')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);
  });

  it('marca el rol de sistema con su badge', async () => {
    signInAs('ADMIN', 50);
    mockListing([makeRole({ isSystemRole: true })]);

    renderPage();

    expect((await screen.findAllByText('Sistema')).length).toBeGreaterThan(0);
  });

  it('no ofrece ningún control de ordenación: level DESC, name ASC es el único orden', async () => {
    signInAs('ADMIN', 50);
    mockListing();

    renderPage();

    await screen.findAllByText('SUPERVISOR');
    expect(screen.queryByRole('button', { name: /Nivel/ })).not.toBeInTheDocument();
  });
});

describe('AppRoleListPage — el buscador', () => {
  it('no pide nada con un solo carácter', async () => {
    signInAs('ADMIN', 50);
    const calls = mockListing();
    const user = setupUser();

    renderPage();
    await screen.findAllByText('SUPERVISOR');
    const initial = calls.length;

    await user.type(screen.getByLabelText('Nombre o código'), 'a');

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(calls.length).toBe(initial);
  });

  it('con dos caracteres hace una petición con name y code iguales', async () => {
    signInAs('ADMIN', 50);
    const calls = mockListing();
    const user = setupUser();

    renderPage();
    await screen.findAllByText('SUPERVISOR');
    const initial = calls.length;

    await user.type(screen.getByLabelText('Nombre o código'), 'su');

    await waitFor(() => expect(calls.length).toBe(initial + 1));
    const search = calls[calls.length - 1].searchParams;
    expect(search.get('name')).toBe('su');
    expect(search.get('code')).toBe('su');
  });

  it('lleva el término a la URL, que es lo que hace reproducible el enlace', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    const user = setupUser();

    const router = renderPage();
    await screen.findAllByText('SUPERVISOR');

    await user.type(screen.getByLabelText('Nombre o código'), 'su');

    await waitFor(() => expect(router.state.location.search).toContain('q=su'));
  });
});

describe('AppRoleListPage — el toggle de retirados', () => {
  it('cambia la petición de /api/roles a /api/roles/admin', async () => {
    signInAs('ADMIN', 50);
    const calls = mockListing();
    const user = setupUser();

    renderPage();
    await screen.findAllByText('SUPERVISOR');
    expect(calls[0].pathname).toBe('/api/roles');

    await user.click(screen.getByRole('switch', { name: 'Mostrar inactivos' }));

    await waitFor(() =>
      expect(calls.some((url) => url.pathname === '/api/roles/admin')).toBe(true),
    );
  });
});

describe('AppRoleListPage — roles de sistema y ciclo de vida', () => {
  async function openFirstRowMenu() {
    const user = setupUser();
    const menus = await screen.findAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    return user;
  }

  it('con ADMIN, un rol de sistema no ofrece editar ni retirar', async () => {
    signInAs('ADMIN', 50);
    mockListing([makeRole({ isSystemRole: true })]);

    renderPage();
    await openFirstRowMenu();

    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, ese mismo rol de sistema ofrece las dos', async () => {
    signInAs('SUPERADMIN', 100);
    mockListing([makeRole({ isSystemRole: true })]);

    renderPage();
    await openFirstRowMenu();

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dar de baja' })).toBeInTheDocument();
  });

  it('el rol SUPERADMIN no ofrece retirar ni al superadministrador', async () => {
    signInAs('SUPERADMIN', 100);
    mockListing([
      makeRole({ roleId: 'role-sa', code: 'SUPERADMIN', name: 'SUPERADMIN', level: 100 }),
    ]);

    renderPage();
    await openFirstRowMenu();

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('con ADMIN, un rol retirado no ofrece reactivar', async () => {
    signInAs('ADMIN', 50);
    mockListing([makeRole({ isActive: false })]);

    renderPage();
    await openFirstRowMenu();

    expect(screen.queryByRole('menuitem', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, un rol retirado sí ofrece reactivar', async () => {
    signInAs('SUPERADMIN', 100);
    mockListing([makeRole({ isActive: false })]);

    renderPage();
    await openFirstRowMenu();

    expect(await screen.findByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('con ADMIN no ofrece ver la auditoría', async () => {
    signInAs('ADMIN', 50);
    mockListing();

    renderPage();
    await openFirstRowMenu();

    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
  });
});

describe('AppRoleListPage — la vista es reproducible desde el enlace', () => {
  it('un enlace con búsqueda y página pinta esa misma vista, sin tocar nada', async () => {
    signInAs('ADMIN', 50);
    const calls = mockListing();

    renderPage('/roles?q=su&page=2');

    await screen.findAllByText('SUPERVISOR');
    const search = calls[0].searchParams;
    expect(search.get('name')).toBe('su');
    expect(search.get('code')).toBe('su');
    expect(Number(search.get('offset'))).toBe(Number(search.get('limit')));
    // El campo se resiembra desde la URL: el término no vive en el componente.
    expect(screen.getByLabelText('Nombre o código')).toHaveValue('su');
  });
});

describe('AppRoleListPage — la auditoría', () => {
  it('con SUPERADMIN, «Ver auditoría» pide el detalle y pinta el historial', async () => {
    signInAs('SUPERADMIN', 100);
    mockListing();
    let detailCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/roles/role-1', () => {
        detailCalls += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            ...makeRole(),
            activeUserCount: 0,
            appDetails: [
              {
                createdAt: '2026-09-01T10:00:00.000Z',
                user: 'me-1',
                method: 'ESAVI-APPROLE-001',
                detail: 'App role created by service',
              },
            ],
          },
        });
      }),
    );
    const user = setupUser();

    renderPage();
    const menus = await screen.findAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Ver auditoría' }));

    await waitFor(() => expect(detailCalls).toBe(1));
    expect(await screen.findByText('ESAVI-APPROLE-001')).toBeInTheDocument();
  });
});

describe('AppRoleListPage — la retirada informada', () => {
  function mockDetail(activeUserCount: number) {
    const calls: string[] = [];
    server.use(
      http.get('http://localhost:4500/api/roles/role-1', ({ request }) => {
        calls.push(request.url);
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { ...makeRole(), activeUserCount },
        });
      }),
    );
    return calls;
  }

  it('con el diálogo cerrado no pide el detalle', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    const detailCalls = mockDetail(0);

    renderPage();
    await screen.findAllByText('SUPERVISOR');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(detailCalls.length).toBe(0);
  });

  it('al abrirlo pide el detalle una sola vez y muestra el recuento antes del DELETE', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    const detailCalls = mockDetail(4);
    let deleteCalls = 0;
    server.use(
      http.delete('http://localhost:4500/api/roles/role-1', () => {
        deleteCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );
    const user = setupUser();

    renderPage();
    const menus = await screen.findAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Dar de baja' }));

    expect(await screen.findByText('4 usuarios portan este rol.')).toBeInTheDocument();
    await waitFor(() => expect(detailCalls.length).toBe(1));
    expect(deleteCalls).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Retirar rol' }));
    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it('«ver quiénes» abre el Sheet de portadores', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    mockDetail(4);
    server.use(
      http.get('http://localhost:4500/api/user-roles/role/role-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            role: { roleId: 'role-1', code: 'SUPERVISOR', name: 'SUPERVISOR', level: 60 },
            rows: [
              {
                userRoleId: 'ur-1',
                userId: 'user-1',
                roleId: 'role-1',
                assignedByUserId: null,
                isActive: true,
                user: {
                  userId: 'user-1',
                  username: 'aperez',
                  firstName: 'Ana',
                  lastName: 'Pérez',
                  email: 'ana@minsa.gob',
                },
              },
            ],
          },
        }),
      ),
    );
    const user = setupUser();

    renderPage();
    const menus = await screen.findAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Dar de baja' }));
    await user.click(await screen.findByRole('button', { name: 'Ver quiénes' }));

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('la página del Sheet no aparece en searchParams', async () => {
    signInAs('ADMIN', 50);
    mockListing();
    mockDetail(0);
    const user = setupUser();

    const router = renderPage();
    const menus = await screen.findAllByRole('button', { name: 'Acciones de la fila' });
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Dar de baja' }));

    expect(router.state.location.search).toBe('');
  });
});
