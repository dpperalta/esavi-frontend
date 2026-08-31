import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { CatalogType } from '@/contracts/declared/catalogType';
import { DropdownMenu, DropdownMenuContent } from '@/shared/components/ui/dropdown-menu';
import { CatalogTypeListPage, CatalogTypeRowActions } from './CatalogTypeListPage';

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

function makeRow(overrides: Partial<CatalogType> = {}): CatalogType {
  return {
    catalogTypeId: 'ct-1',
    code: 'EXISTING',
    name: 'Existente',
    description: null,
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/catalog-types') {
  const router = createMemoryRouter(
    [{ path: '/catalog-types', element: <CatalogTypeListPage /> }],
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

describe('CatalogTypeListPage — crear', () => {
  it('crear un tipo lo hace aparecer en la tabla sin recargar', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);

    const rows: CatalogType[] = [makeRow()];
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
      ),
      http.post('http://localhost:4500/api/catalog-types', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        const created = makeRow({
          catalogTypeId: 'ct-2',
          code: 'NUEVO',
          name: body.name,
        });
        rows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created });
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Existente').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nombre'), 'Tipo nuevo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getAllByText('Tipo nuevo').length).toBeGreaterThan(0));
  });
});

describe('CatalogTypeListPage — autorización', () => {
  it('con nivel USER no hay botón «Crear» en la cabecera', async () => {
    signInAs('USER', 25);

    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeRow()] } }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Existente').length).toBeGreaterThan(0));

    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });

  // Renders the row menu forced open (Radix's controlled `open` prop) instead of going through
  // ResourceTable's click-to-open trigger: jsdom has no PointerEvent implementation, and
  // DropdownMenuTrigger opens on `onPointerDown`, not `onClick` — simulating that reliably in
  // jsdom isn't worth fighting for a menu whose gating logic is the actual thing under test.
  it('con nivel USER, el menú de fila no ofrece «Editar» pero sí «Ver auditoría»', async () => {
    signInAs('USER', 25);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu open onOpenChange={() => {}}>
          <DropdownMenuContent>
            <CatalogTypeRowActions
              row={makeRow()}
              onEdit={() => {}}
              onAudit={() => {}}
              onConfirm={() => {}}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('menuitem', { name: 'Ver auditoría' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('con nivel ADMIN, el menú de fila sí ofrece «Editar» y «Dar de baja»', async () => {
    signInAs('ADMIN', 50);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu open onOpenChange={() => {}}>
          <DropdownMenuContent>
            <CatalogTypeRowActions
              row={makeRow()}
              onEdit={() => {}}
              onAudit={() => {}}
              onConfirm={() => {}}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dar de baja' })).toBeInTheDocument();
  });
});

describe('CatalogTypeListPage — paginación en la URL', () => {
  it('page=2 en la URL sobrevive al refresco y el enlace reproduce la misma vista', async () => {
    const user = userEvent.setup();
    signInAs('ADMIN', 50);

    const receivedOffsets: (string | null)[] = [];
    const manyRows: CatalogType[] = Array.from({ length: 15 }, (_, index) =>
      makeRow({ catalogTypeId: `ct-${index}`, code: `CODE_${index}`, name: `Tipo ${index}` }),
    );
    server.use(
      http.get('http://localhost:4500/api/catalog-types', ({ request }) => {
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

    await waitFor(() => expect(screen.getAllByText('Tipo 0').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    await waitFor(() => expect(receivedOffsets).toContain('10'));

    // "El enlace reproduce la misma vista": a fresh mount at the same URL, with no click
    // through the pagination controls, must request the same offset on its own.
    renderPage('/catalog-types?page=2');

    await waitFor(() => expect(screen.getAllByText('Tipo 10').length).toBeGreaterThan(0));
  });
});
