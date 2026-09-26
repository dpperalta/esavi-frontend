import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineWhodrugListPage } from './VaccineWhodrugListPage';

const API = 'http://localhost:4500/api';
const VACCINE_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
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

function makeRow(overrides: Partial<VaccineWhodrugDetail> = {}): VaccineWhodrugDetail {
  return {
    vaccineWhodrugId: VACCINE_ID,
    externalId: 1001,
    drugCode: '000001 01 001',
    drugRecNo: '000001',
    drugRecNoSeq: '01',
    drugName: 'BCG Vaccine',
    language: 'es',
    medicinalProductId: null,
    atcs: 'J07AN01',
    icd11: null,
    icd11Term: null,
    abbreviation: 'BCG',
    ingredient: null,
    ingredientTranslation: 'Mycobacterium bovis',
    languageCode: null,
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Serum Institute',
    maHoldersMedicinalProductId: null,
    form: null,
    formTranslations: 'Polvo',
    formMedicinalProductId: null,
    strength: '0.05 mg',
    strengthMedicinalProductId: null,
    noDose: null,
    diluent: null,
    isGeneric: null,
    isPreferred: true,
    notes: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

// Records every listing request so the tests can assert on the route and the query string.
function serveList(rows: VaccineWhodrugDetail[]) {
  const requests: URL[] = [];
  const respond = ({ request }: { request: Request }) => {
    requests.push(new URL(request.url));
    return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
  };
  server.use(
    http.get(`${API}/whodrug-vaccines`, respond),
    http.get(`${API}/whodrug-vaccines/admin`, respond),
  );
  return requests;
}

function renderPage(initialPath = '/whodrug-vaccines') {
  const router = createMemoryRouter(
    [
      { path: '/whodrug-vaccines', element: <VaccineWhodrugListPage /> },
      { path: '/whodrug-vaccines/new', element: <p>alta</p> },
      { path: '/whodrug-vaccines/import', element: <p>importación</p> },
      { path: '/whodrug-vaccines/:id', element: <p>detalle</p> },
      { path: '/whodrug-vaccines/:id/edit', element: <p>edición</p> },
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

async function openRowMenu(user: ReturnType<typeof setupUser>) {
  const [trigger] = await screen.findAllByRole('button', { name: 'Acciones de la vacuna' });
  await user.click(trigger);
}

describe('VaccineWhodrugListPage — filtros en la URL (SPEC FE25c §3.4)', () => {
  it('teclear «bcg» envía name y code, nunca search ni language, y lo escribe en q', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    const requests = serveList([makeRow()]);
    const router = renderPage();

    await screen.findAllByText('000001 01 001');
    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'bcg');

    await waitFor(() => expect(router.state.location.search).toContain('q=bcg'));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('name')).toBe('bcg'));
    expect(requests.at(-1)?.searchParams.get('code')).toBe('bcg');
    expect(requests.at(-1)?.searchParams.has('search')).toBe(false);
    expect(requests.every((url) => !url.searchParams.has('language'))).toBe(true);
  });

  it('con un solo carácter no envía la búsqueda', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    const requests = serveList([makeRow()]);
    const router = renderPage();

    await screen.findAllByText('000001 01 001');
    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'b');

    await waitFor(() => expect(router.state.location.search).toContain('q=b'));
    expect(requests.every((url) => !url.searchParams.has('name'))).toBe(true);
  });

  it('isPreferred=true en la URL filtra, y cargar la URL reproduce todos los filtros', async () => {
    signInAs('USER', 25);
    const requests = serveList([makeRow()]);
    renderPage('/whodrug-vaccines?q=bcg&iso3Code=ECU&isPreferred=true&isGeneric=false&page=2');

    expect(await screen.findByLabelText('Buscar por nombre o código')).toHaveValue('bcg');
    expect(screen.getAllByLabelText('País (ISO3)')[0]).toHaveValue('ECU');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('isPreferred')).toBe('true'));
    const last = requests.at(-1)!;
    expect(last.searchParams.get('name')).toBe('bcg');
    expect(last.searchParams.get('iso3Code')).toBe('ECU');
    expect(last.searchParams.get('isGeneric')).toBe('false');
    expect(Number(last.searchParams.get('offset'))).toBeGreaterThan(0);
  });

  it('una URL con un booleano inválido no lo envía', async () => {
    signInAs('USER', 25);
    const requests = serveList([makeRow()]);
    renderPage('/whodrug-vaccines?isPreferred=maybe');

    await screen.findAllByText('000001 01 001');
    expect(requests.at(-1)?.searchParams.has('isPreferred')).toBe(false);
  });

  it('«Limpiar filtros» borra los filtros y la página, pero conserva includeInactive', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([]);
    const router = renderPage(
      '/whodrug-vaccines?includeInactive=true&q=xx&iso3Code=ECU&isPreferred=true&isGeneric=false&page=3',
    );

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => expect(router.state.location.search).toBe('?includeInactive=true'));
  });
});

describe('VaccineWhodrugListPage — rol, filas y acciones (SPEC FE25c §3.1)', () => {
  it('con USER no se ven el toggle, «Crear» ni «Importar»; la fila activa ofrece «Ver»', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    serveList([makeRow()]);
    renderPage();

    await screen.findAllByText('000001 01 001');
    expect(screen.queryByRole('switch', { name: 'Mostrar inactivos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear vacuna/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /importar diccionario/i })).not.toBeInTheDocument();

    await openRowMenu(user);
    expect(await screen.findByRole('menuitem', { name: 'Ver' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('el nombre de una fila activa es un enlace al detalle', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    serveList([makeRow()]);
    const router = renderPage();

    const [link] = await screen.findAllByRole('link', { name: 'BCG Vaccine' });
    expect(link).toHaveAttribute('href', `/whodrug-vaccines/${VACCINE_ID}`);

    link.focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${VACCINE_ID}`);
  });

  it('con ADMIN, una fila inactiva no ofrece «Ver» ni «Editar», no es enlace y no tiene menú', async () => {
    signInAs('ADMIN', 50);
    serveList([makeRow({ isActive: false })]);
    renderPage('/whodrug-vaccines?includeInactive=true');

    await screen.findAllByText('BCG Vaccine');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /crear vacuna/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'BCG Vaccine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones de la vacuna' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /importar diccionario/i })).not.toBeInTheDocument();
  });

  it('con ADMIN, una fila activa ofrece «Ver», «Editar» y «Dar de baja», y «Editar» abre el formulario', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([makeRow()]);
    const router = renderPage();

    await screen.findAllByText('000001 01 001');
    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Ver' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dar de baja' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ver auditoría' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${VACCINE_ID}/edit`);
  });

  it('con SUPERADMIN, una fila inactiva ofrece «Ver», «Editar», «Ver auditoría» y «Reactivar»', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow({ isActive: false })]);
    renderPage('/whodrug-vaccines?includeInactive=true');

    expect((await screen.findAllByRole('link', { name: 'BCG Vaccine' })).length).toBeGreaterThan(0);
    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Ver' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ver auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('dar de baja pide confirmación y envía el 005A', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([makeRow()]);
    let deleted = false;
    server.use(
      http.delete(`${API}/whodrug-vaccines/${VACCINE_ID}`, () => {
        deleted = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ isActive: false }) });
      }),
    );
    renderPage();

    await screen.findAllByText('000001 01 001');
    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Dar de baja' }));
    expect(deleted).toBe(false);

    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('una fila preferida lleva el badge «Preferido»', async () => {
    signInAs('USER', 25);
    serveList([makeRow({ isPreferred: true })]);
    renderPage();

    await screen.findAllByText('000001 01 001');
    expect(
      screen.getAllByText('Preferido', { selector: '[data-slot="badge"]' }).length,
    ).toBeGreaterThan(0);
  });

  it('con SUPERADMIN, «Importar diccionario» lleva a la importación', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow()]);
    const router = renderPage();

    await user.click(await screen.findByRole('link', { name: /importar diccionario/i }));
    expect(router.state.location.pathname).toBe('/whodrug-vaccines/import');
  });

  it('con ADMIN, «Crear vacuna» lleva al alta', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([makeRow()]);
    const router = renderPage();

    await user.click(await screen.findByRole('button', { name: /crear vacuna/i }));
    expect(router.state.location.pathname).toBe('/whodrug-vaccines/new');
  });

  it('con SUPERADMIN y el diccionario vacío, el estado vacío ofrece importar y crear', async () => {
    signInAs('SUPERADMIN', 100);
    serveList([]);
    renderPage();

    expect(
      await screen.findByText('Todavía no hay vacunas en el diccionario WHODrug.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /importar diccionario/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /crear vacuna/i }).length).toBeGreaterThan(0);
  });
});
