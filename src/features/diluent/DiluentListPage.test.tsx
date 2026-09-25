import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { Diluent } from '@/contracts/declared/diluent';
import { DiluentListPage } from './DiluentListPage';

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
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function makeRow(overrides: Partial<Diluent> = {}): Diluent {
  return {
    diluentCatalogId: 'd-1',
    code: 'AGUA_DESTILADA',
    name: 'Agua destilada',
    description: null,
    composition: 'H2O',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

// Records every listing request so the tests can assert on the route and the query string.
function serveList(rows: Diluent[]) {
  const requests: URL[] = [];
  const respond = ({ request }: { request: Request }) => {
    requests.push(new URL(request.url));
    return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
  };
  server.use(http.get(`${API}/diluents`, respond), http.get(`${API}/diluents/admin`, respond));
  return requests;
}

function renderPage(initialPath = '/diluents') {
  const router = createMemoryRouter([{ path: '/diluents', element: <DiluentListPage /> }], {
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

async function openRowMenu(user: ReturnType<typeof setupUser>) {
  const [trigger] = await screen.findAllByRole('button', { name: 'Acciones del diluyente' });
  await user.click(trigger);
}

describe('DiluentListPage — búsqueda en la URL', () => {
  it('teclear «agua» envía name=agua&code=agua una sola vez tras el debounce y lo escribe en q', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    const requests = serveList([makeRow()]);
    const router = renderPage();

    await screen.findAllByText('Agua destilada');
    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'agua');

    await waitFor(() => expect(router.state.location.search).toContain('q=agua'));
    await waitFor(() =>
      expect(requests.filter((url) => url.searchParams.has('name'))).toHaveLength(1),
    );
    const searched = requests.find((url) => url.searchParams.has('name'))!;
    expect(searched.searchParams.get('name')).toBe('agua');
    expect(searched.searchParams.get('code')).toBe('agua');
    expect(searched.searchParams.has('search')).toBe(false);
  });

  it('al cargar con ?q=agua (recarga o enlace) la búsqueda se conserva', async () => {
    signInAs('USER', 25);
    const requests = serveList([makeRow()]);
    renderPage('/diluents?q=agua');

    expect(await screen.findByLabelText('Buscar por nombre o código')).toHaveValue('agua');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('name')).toBe('agua'));
  });

  it('con menos de 2 caracteres no envía name ni code', async () => {
    signInAs('USER', 25);
    const requests = serveList([makeRow()]);
    renderPage('/diluents?q=a');

    await screen.findAllByText('Agua destilada');
    expect(
      requests.every((url) => !url.searchParams.has('name') && !url.searchParams.has('code')),
    ).toBe(true);
  });

  it('una búsqueda sin resultados ofrece «Limpiar búsqueda», que borra q', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    serveList([]);
    const router = renderPage('/diluents?q=zzz&page=2');

    expect(
      await screen.findByText('Ningún diluyente coincide con la búsqueda.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

describe('DiluentListPage — inactivos', () => {
  it('con includeInactive=true y ADMIN la petición va a /diluents/admin', async () => {
    signInAs('ADMIN', 50);
    const requests = serveList([makeRow()]);
    renderPage('/diluents?includeInactive=true');

    await waitFor(() =>
      expect(requests.some((url) => url.pathname === '/api/diluents/admin')).toBe(true),
    );
  });

  it('sin el parámetro va a /diluents', async () => {
    signInAs('ADMIN', 50);
    const requests = serveList([makeRow()]);
    renderPage();

    await screen.findAllByText('Agua destilada');
    expect(requests.every((url) => url.pathname === '/api/diluents')).toBe(true);
  });
});

describe('DiluentListPage — acciones por rol', () => {
  it('con USER no aparecen el toggle, «Crear diluyente» ni el menú de acciones', async () => {
    signInAs('USER', 25);
    serveList([makeRow()]);
    renderPage();

    await screen.findAllByText('Agua destilada');
    expect(screen.queryByRole('switch', { name: 'Mostrar inactivos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crear diluyente/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acciones del diluyente' }),
    ).not.toBeInTheDocument();
  });

  it('con ADMIN, una fila activa ofrece «Editar» y «Dar de baja», no «Ver auditoría»', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([makeRow()]);
    renderPage();

    expect(await screen.findByRole('button', { name: /Crear diluyente/ })).toBeInTheDocument();
    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dar de baja' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
  });

  it('con ADMIN, una fila inactiva no ofrece «Editar» (ni menú alguno)', async () => {
    signInAs('ADMIN', 50);
    serveList([makeRow({ isActive: false, deletedAt: '2026-09-10T00:00:00.000Z' })]);
    renderPage('/diluents?includeInactive=true');

    await screen.findAllByText('Agua destilada');
    // The role has loaded (ADMIN-only button is there), so the missing menu isn't a false green.
    expect(await screen.findByRole('button', { name: /Crear diluyente/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acciones del diluyente' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, una fila inactiva ofrece «Editar», «Ver auditoría» y «Reactivar»', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow({ isActive: false, deletedAt: '2026-09-10T00:00:00.000Z' })]);
    renderPage('/diluents?includeInactive=true');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ver auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('la fila OTHER activa ofrece «Editar» pero no «Dar de baja», ni siquiera a SUPERADMIN', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow({ code: 'OTHER', name: 'Otro' })]);
    renderPage();

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('«Dar de baja» pide confirmación y envía el DELETE', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    let deleted = false;
    serveList([makeRow()]);
    server.use(
      http.delete(`${API}/diluents/d-1`, () => {
        deleted = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Dar de baja' }));
    expect(await screen.findByText('¿Dar de baja este registro?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(deleted).toBe(true));
  });
});
