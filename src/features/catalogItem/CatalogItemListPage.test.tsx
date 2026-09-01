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
import type { CatalogItem } from '@/contracts/declared/catalogItem';
import { CatalogItemListPage } from './CatalogItemListPage';

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

function makeTypeRow(overrides: Partial<CatalogType> = {}): CatalogType {
  return {
    catalogTypeId: 'ct-1',
    code: 'OUTCOME',
    name: 'Desenlace',
    description: null,
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function makeItemRow(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    catalogItemId: 'ci-1',
    catalogTypeId: 'ct-1',
    code: 'DEATH',
    name: 'Muerte',
    value: 'DEATH',
    isValueLocked: false,
    description: null,
    sortOrder: 1,
    metadata: null,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/catalog-items') {
  const router = createMemoryRouter(
    [{ path: '/catalog-items', element: <CatalogItemListPage /> }],
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

describe('CatalogItemListPage — sin typeId', () => {
  it('no monta la tabla ni pide /api/catalog-items/type/:id', async () => {
    signInAs('USER', 25);
    let itemsHit = false;
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeTypeRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/:id', () => {
        itemsHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage();

    expect(
      await screen.findByText('Elige un tipo de catálogo para ver sus elementos.'),
    ).toBeInTheDocument();
    expect(itemsHit).toBe(false);
  });
});

describe('CatalogItemListPage — elegir un tipo', () => {
  it('monta la tabla y pega a /catalog-items/type/:id', async () => {
    const user = userEvent.setup();
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeTypeRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeItemRow()] } }),
      ),
    );

    renderPage();

    await user.click(await screen.findByRole('combobox', { name: 'Tipo de catálogo' }));
    await user.click(await screen.findByRole('option', { name: /Desenlace/i }));

    await waitFor(() => expect(screen.getAllByText('Muerte').length).toBeGreaterThan(0));
  });
});

describe('CatalogItemListPage — typeId desconocido', () => {
  it('pinta unknownType, no una tabla vacía, y no pide /api/catalog-items/type/:id', async () => {
    signInAs('USER', 25);
    let itemsHit = false;
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeTypeRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/:id', () => {
        itemsHit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPage('/catalog-items?typeId=ct-missing');

    expect(
      await screen.findByText('El tipo de catálogo del enlace no existe. Elige uno de la lista.'),
    ).toBeInTheDocument();
    expect(itemsHit).toBe(false);
  });
});

describe('CatalogItemListPage — cambio de tipo resetea page', () => {
  it('cambiar de tipo estando en page=3 deja la URL en page=1', async () => {
    const user = userEvent.setup();
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 2,
            rows: [makeTypeRow(), makeTypeRow({ catalogTypeId: 'ct-2', code: 'SEX', name: 'Sexo' })],
          },
        }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 40, rows: [makeItemRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/ct-2', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 3, rows: [] } }),
      ),
    );

    const router = renderPage('/catalog-items?typeId=ct-1&page=3');

    await waitFor(() => expect(screen.getAllByText('Muerte').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('combobox', { name: 'Tipo de catálogo' }));
    await user.click(await screen.findByRole('option', { name: /Sexo/i }));

    await waitFor(() => expect(router.state.location.search).toBe('?typeId=ct-2'));
  });
});

describe('CatalogItemListPage — persistencia en la URL', () => {
  it('?typeId=<id>&page=2 reproduce la misma vista tras un refresco', async () => {
    signInAs('USER', 25);
    let receivedOffset: string | null = null;
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeTypeRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', ({ request }) => {
        const url = new URL(request.url);
        receivedOffset = url.searchParams.get('offset');
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 30, rows: [makeItemRow()] },
        });
      }),
    );

    renderPage('/catalog-items?typeId=ct-1&page=2');

    await waitFor(() => expect(receivedOffset).not.toBeNull());
    // Default pageSize is 10 (preferences.types.ts) — page 2 is offset 10.
    expect(receivedOffset).toBe('10');
  });
});

describe('CatalogItemListPage — autorización', () => {
  it('con nivel USER no hay botón «Crear» ni toggle de inactivos', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeTypeRow()] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/ct-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [makeItemRow()] } }),
      ),
    );

    renderPage('/catalog-items?typeId=ct-1');

    await waitFor(() => expect(screen.getAllByText('Muerte').length).toBeGreaterThan(0));

    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mostrar inactivos')).not.toBeInTheDocument();
  });
});
