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
import type { GeoLevelType } from '@/contracts/declared/geoLevelType';
import { DropdownMenu, DropdownMenuContent } from '@/shared/components/ui/dropdown-menu';
import { GeoLevelTypeListPage, GeoLevelTypeRowActions } from './GeoLevelTypeListPage';

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
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function makeRow(overrides: Partial<GeoLevelType> = {}): GeoLevelType {
  return {
    geoLevelTypeId: 'glt-1',
    code: 'COUNTRY',
    name: 'País',
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/geo-level-types') {
  const router = createMemoryRouter(
    [{ path: '/geo-level-types', element: <GeoLevelTypeListPage /> }],
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

describe('GeoLevelTypeListPage — crear', () => {
  it('crear un nivel lo hace aparecer en la tabla sin recargar', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);

    const rows: GeoLevelType[] = [makeRow()];
    server.use(
      http.get('http://localhost:4500/api/geo-level-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
      ),
      http.post('http://localhost:4500/api/geo-level-types', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        const created = makeRow({ geoLevelTypeId: 'glt-2', code: 'PROVINCE', name: body.name });
        rows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created });
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('País').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Código'), 'PROVINCE');
    await user.type(screen.getByLabelText('Nombre'), 'Provincia');
    await user.type(screen.getByLabelText('Orden'), '2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getAllByText('Provincia').length).toBeGreaterThan(0));
  });
});

describe('GeoLevelTypeListPage — sin toggle de inactivos (serverDecides)', () => {
  it('con SUPERADMIN no aparece «Mostrar inactivos»', async () => {
    signInAs('SUPERADMIN', 100);

    server.use(
      http.get('http://localhost:4500/api/geo-level-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('País').length).toBeGreaterThan(0));
    expect(screen.queryByText('Mostrar inactivos')).not.toBeInTheDocument();
  });
});

describe('GeoLevelTypeListPage — autorización', () => {
  it('con nivel USER no hay botón «Crear» en la cabecera', async () => {
    signInAs('USER', 25);

    server.use(
      http.get('http://localhost:4500/api/geo-level-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('País').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });

  it('con nivel USER, el menú de fila no ofrece ni «Editar» ni «Ver auditoría»', async () => {
    let requestCount = 0;
    setAccessToken('a-token');
    tokenStore.setRefreshToken('a-refresh-token');
    server.use(
      http.get('http://localhost:4500/api/users/me', () => {
        requestCount += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
        });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu open onOpenChange={() => {}}>
          <DropdownMenuContent>
            <GeoLevelTypeRowActions row={makeRow()} onEdit={() => {}} onAudit={() => {}} onConfirm={() => {}} />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(requestCount).toBe(1));

    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('con nivel ADMIN, el menú de fila ofrece «Editar» y «Dar de baja», pero no «Ver auditoría»', async () => {
    signInAs('ADMIN', 50);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu open onOpenChange={() => {}}>
          <DropdownMenuContent>
            <GeoLevelTypeRowActions row={makeRow()} onEdit={() => {}} onAudit={() => {}} onConfirm={() => {}} />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dar de baja' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
  });

  it('con nivel SUPERADMIN, el menú de fila sí ofrece «Ver auditoría»', async () => {
    signInAs('SUPERADMIN', 100);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu open onOpenChange={() => {}}>
          <DropdownMenuContent>
            <GeoLevelTypeRowActions row={makeRow()} onEdit={() => {}} onAudit={() => {}} onConfirm={() => {}} />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('menuitem', { name: 'Ver auditoría' })).toBeInTheDocument();
  });
});

describe('GeoLevelTypeListPage — paginación en la URL', () => {
  it('page=2 en la URL sobrevive al refresco y el enlace reproduce la misma vista', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);

    const receivedOffsets: (string | null)[] = [];
    const manyRows: GeoLevelType[] = Array.from({ length: 15 }, (_, index) =>
      makeRow({ geoLevelTypeId: `glt-${index}`, code: `CODE_${index}`, name: `Nivel ${index}` }),
    );
    server.use(
      http.get('http://localhost:4500/api/geo-level-types', ({ request }) => {
        const url = new URL(request.url);
        const offset = url.searchParams.get('offset');
        receivedOffsets.push(offset);
        const limit = Number(url.searchParams.get('limit'));
        const offsetNum = Number(offset ?? '0');
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: manyRows.length, rows: manyRows.slice(offsetNum, offsetNum + limit) },
        });
      }),
    );

    const router = renderPage();

    await waitFor(() => expect(screen.getAllByText('Nivel 0').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    await waitFor(() => expect(receivedOffsets).toContain('10'));

    renderPage('/geo-level-types?page=2');

    await waitFor(() => expect(screen.getAllByText('Nivel 10').length).toBeGreaterThan(0));
  });
});
