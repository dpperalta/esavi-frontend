import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { WhodrugProductRow } from '@/contracts/declared/whodrugProduct';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { WhodrugProductListPage } from './WhodrugProductListPage';

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

function makeRow(overrides: Partial<WhodrugProductRow> = {}): WhodrugProductRow {
  return {
    whodrugProductId: 'p-1',
    rowHash: 'a'.repeat(64),
    drugCode: '000001010016',
    drugName: 'Paracetamol',
    drugAtcs: ';N02BE01;',
    medicinalProductId: null,
    atcs: 'N02BE01',
    ingredient: 'Paracetamol',
    ingredientTranslations: 'Paracetamol',
    languageCode: 'es',
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Laboratorio X',
    maHoldersMedicinalProductId: null,
    form: 'Tableta',
    formMedicinalProductId: null,
    strength: '500 mg',
    strengthMedicinalProductId: null,
    isGeneric: true,
    isPreferred: false,
    optionName: 'Paracetamol (Paracetamol)',
    optionNameSearch: 'paracetamol (paracetamol)',
    metadata: {},
    isActive: true,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

// Records every listing request; `rowsFor` lets a test answer each page differently.
function serveList(rowsFor: (url: URL) => WhodrugProductRow[], count?: number) {
  const requests: URL[] = [];
  server.use(
    http.get(`${API}/whodrug-products/admin`, ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const rows = rowsFor(url);
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: count ?? rows.length, rows },
      });
    }),
  );
  return requests;
}

function renderPage(initialPath = '/whodrug-products') {
  const router = createMemoryRouter(
    [
      { path: '/whodrug-products', element: <WhodrugProductListPage /> },
      { path: '/whodrug-products/sync', element: <p>sincronización</p> },
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

describe('WhodrugProductListPage — filtros en la URL (SPEC FE25d §3.4)', () => {
  it('escribir «para» en principio activo envía ingredient=para una sola vez y lo escribe en la URL', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    const requests = serveList(() => [makeRow()]);
    const router = renderPage();

    await screen.findAllByRole('button', { name: 'Paracetamol' });
    await user.type(screen.getByLabelText('Principio activo'), 'para');

    await waitFor(() => expect(router.state.location.search).toContain('ingredient=para'));
    await waitFor(() =>
      expect(requests.filter((url) => url.searchParams.has('ingredient'))).toHaveLength(1),
    );
    expect(requests.at(-1)?.searchParams.get('ingredient')).toBe('para');
    expect(requests.at(-1)?.searchParams.has('name')).toBe(false);
  });

  it('recargar con ?ingredient=para conserva el campo y el filtro', async () => {
    signInAs('ADMIN', 50);
    const requests = serveList(() => [makeRow()]);
    renderPage('/whodrug-products?ingredient=para');

    await screen.findAllByRole('button', { name: 'Paracetamol' });
    expect(screen.getByLabelText('Principio activo')).toHaveValue('para');
    expect(requests[0]?.searchParams.get('ingredient')).toBe('para');
  });

  it('con menos de 3 caracteres muestra la ayuda y no envía el parámetro', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    const requests = serveList(() => [makeRow()]);
    const router = renderPage();

    await screen.findAllByRole('button', { name: 'Paracetamol' });
    await user.type(screen.getByLabelText('Nombre comercial'), 'pa');

    expect(screen.getByText('Escribe al menos 3 caracteres.')).toBeInTheDocument();
    // Longer than the debounce: nothing reaches the URL or the API.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(router.state.location.search).not.toContain('name=');
    expect(requests.every((url) => !url.searchParams.has('name'))).toBe(true);
  });
});

describe('WhodrugProductListPage — cabecera y filas (SPEC FE25d §3.1)', () => {
  it('con ADMIN no se ve «Sincronizar con WHODrug»', async () => {
    signInAs('ADMIN', 50);
    serveList(() => [makeRow()]);
    renderPage();

    await screen.findAllByRole('button', { name: 'Paracetamol' });
    expect(screen.queryByRole('link', { name: 'Sincronizar con WHODrug' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN «Sincronizar con WHODrug» lleva a /whodrug-products/sync', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList(() => [makeRow()]);
    const router = renderPage();

    await user.click(await screen.findByRole('link', { name: 'Sincronizar con WHODrug' }));

    expect(router.state.location.pathname).toBe('/whodrug-products/sync');
  });

  it('no renderiza ningún toggle de inactivos', async () => {
    signInAs('SUPERADMIN', 100);
    serveList(() => [makeRow()]);
    renderPage();

    await screen.findAllByRole('button', { name: 'Paracetamol' });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Mostrar inactivos')).not.toBeInTheDocument();
  });

  it('una fila retirada lleva el badge «Retirado del estándar»', async () => {
    signInAs('ADMIN', 50);
    serveList(() => [makeRow({ isActive: false, deletedAt: '2026-09-21T10:00:00.000Z' })]);
    renderPage();

    expect((await screen.findAllByText('Retirado del estándar')).length).toBeGreaterThan(0);
  });

  it('Enter sobre el nombre abre el panel con la fila, sin otra petición', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    const requests = serveList(() => [makeRow()]);
    renderPage();

    const [rowButton] = await screen.findAllByRole('button', { name: 'Paracetamol' });
    rowButton!.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Paracetamol' })).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('cambiar de página con el panel abierto lo cierra', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList(
      (url) =>
        url.searchParams.get('offset') === '0'
          ? [makeRow()]
          : [makeRow({ whodrugProductId: 'p-2', drugName: 'Ibuprofeno' })],
      60,
    );
    const router = renderPage();

    const [rowButton] = await screen.findAllByRole('button', { name: 'Paracetamol' });
    await user.click(rowButton!);
    expect(await screen.findByRole('dialog', { name: 'Paracetamol' })).toBeInTheDocument();

    await router.navigate('/whodrug-products?page=2');

    await screen.findAllByRole('button', { name: 'Ibuprofeno' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Back on page 1 the row is there again, but the panel stays closed.
    await router.navigate('/whodrug-products');
    await screen.findAllByRole('button', { name: 'Paracetamol' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
