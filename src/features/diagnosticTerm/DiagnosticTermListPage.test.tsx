import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DiagnosticTermListPage } from './DiagnosticTermListPage';

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

function makeRow(overrides: Partial<DiagnosticTerm> = {}): DiagnosticTerm {
  return {
    diagnosticTermId: 't-1',
    source: 'MEDDRA',
    code: '10016558',
    name: 'Fiebre',
    termGroup: 'LLT',
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
function serveList(rows: DiagnosticTerm[]) {
  const requests: URL[] = [];
  const respond = ({ request }: { request: Request }) => {
    requests.push(new URL(request.url));
    return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
  };
  server.use(
    http.get(`${API}/diagnostic-terms`, respond),
    http.get(`${API}/diagnostic-terms/admin`, respond),
  );
  return requests;
}

function renderPage(initialPath = '/diagnostic-terms') {
  const router = createMemoryRouter(
    [
      { path: '/diagnostic-terms', element: <DiagnosticTermListPage /> },
      { path: '/diagnostic-terms/import', element: <p>import page</p> },
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
  const [trigger] = await screen.findAllByRole('button', {
    name: 'Acciones del término diagnóstico',
  });
  await user.click(trigger);
}

describe('DiagnosticTermListPage — filtros en la URL', () => {
  it('teclear «fiebre» envía name y code, nunca search, y lo escribe en q', async () => {
    signInAs('USER', 25);
    const user = setupUser();
    const requests = serveList([makeRow()]);
    const router = renderPage();

    await screen.findAllByText('Fiebre');
    await user.type(screen.getByLabelText('Buscar por nombre o código'), 'fiebre');

    await waitFor(() => expect(router.state.location.search).toContain('q=fiebre'));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('name')).toBe('fiebre'));
    expect(requests.at(-1)?.searchParams.get('code')).toBe('fiebre');
    expect(requests.at(-1)?.searchParams.has('search')).toBe(false);
  });

  it('al cargar con q, source y termGroup en la URL, la vista se reproduce', async () => {
    signInAs('USER', 25);
    const requests = serveList([makeRow()]);
    renderPage('/diagnostic-terms?q=fie&source=MEDDRA&termGroup=LLT');

    expect(await screen.findByLabelText('Buscar por nombre o código')).toHaveValue('fie');
    expect(screen.getByLabelText('Grupo de término')).toHaveValue('LLT');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('name')).toBe('fie'));
    expect(requests.at(-1)?.searchParams.get('source')).toBe('MEDDRA');
    expect(requests.at(-1)?.searchParams.get('termGroup')).toBe('LLT');
  });
});

describe('DiagnosticTermListPage — reviewStatus ↔ includeInactive (SPEC FE25b §3.4)', () => {
  it('elegir «Pendiente» pone includeInactive=true y la petición va al 002B con reviewStatus', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    const requests = serveList([makeRow({ metadata: { reviewStatus: 'PENDING' } })]);
    const router = renderPage();

    const trigger = await screen.findByRole('combobox', { name: 'Estado de revisión' });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Pendiente' }));

    await waitFor(() => expect(router.state.location.search).toContain('reviewStatus=PENDING'));
    expect(router.state.location.search).toContain('includeInactive=true');
    await waitFor(() => expect(requests.at(-1)?.pathname).toBe('/api/diagnostic-terms/admin'));
    expect(requests.at(-1)?.searchParams.get('reviewStatus')).toBe('PENDING');
    expect(screen.getByRole('switch', { name: 'Mostrar inactivos' })).toBeChecked();
  });

  it('apagar el toggle quita reviewStatus y ninguna petición al 002A lo lleva', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    const requests = serveList([makeRow()]);
    const router = renderPage('/diagnostic-terms?includeInactive=true&reviewStatus=PENDING');

    const toggle = await screen.findByRole('switch', { name: 'Mostrar inactivos' });
    await waitFor(() => expect(toggle).toBeChecked());
    await user.click(toggle);

    await waitFor(() => expect(router.state.location.search).not.toContain('reviewStatus'));
    expect(router.state.location.search).not.toContain('includeInactive');
    // No fresh 002A request is asserted: the unfiltered public listing was already fetched while
    // the role was loading, and that cache entry is what the toggle-off view reads.
    expect(toggle).not.toBeChecked();
    const publicRequests = requests.filter((url) => url.pathname === '/api/diagnostic-terms');
    expect(publicRequests.every((url) => !url.searchParams.has('reviewStatus'))).toBe(true);
  });

  it('una URL con reviewStatus sin el toggle se repara añadiendo includeInactive=true', async () => {
    signInAs('ADMIN', 50);
    const requests = serveList([makeRow()]);
    const router = renderPage('/diagnostic-terms?reviewStatus=APPROVED');

    await waitFor(() => expect(router.state.location.search).toContain('includeInactive=true'));
    await waitFor(() => expect(requests.at(-1)?.pathname).toBe('/api/diagnostic-terms/admin'));
    expect(requests.at(-1)?.searchParams.get('reviewStatus')).toBe('APPROVED');
    const publicRequests = requests.filter((url) => url.pathname === '/api/diagnostic-terms');
    expect(publicRequests.every((url) => !url.searchParams.has('reviewStatus'))).toBe(true);
  });

  it('«Limpiar filtros» borra los filtros pero conserva includeInactive', async () => {
    signInAs('ADMIN', 50);
    const user = setupUser();
    serveList([]);
    const router = renderPage(
      '/diagnostic-terms?includeInactive=true&reviewStatus=PENDING&source=LOCAL&q=xx',
    );

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => expect(router.state.location.search).toBe('?includeInactive=true'));
  });
});

describe('DiagnosticTermListPage — rol y acciones', () => {
  it('con USER no se ven el filtro de revisión, el toggle, «Crear» ni «Importar»', async () => {
    signInAs('USER', 25);
    serveList([makeRow()]);
    renderPage();

    await screen.findAllByText('Fiebre');
    expect(screen.queryByRole('combobox', { name: 'Estado de revisión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Mostrar inactivos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear término/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /importar diccionario/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acciones del término diagnóstico' }),
    ).not.toBeInTheDocument();
  });

  it('con ADMIN, «Crear» sí y «Importar» no; una fila inactiva no ofrece «Editar»', async () => {
    signInAs('ADMIN', 50);
    serveList([makeRow({ isActive: false })]);
    renderPage('/diagnostic-terms?includeInactive=true');

    await screen.findAllByText('Fiebre');
    expect(screen.getByRole('button', { name: /crear término/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /importar diccionario/i })).not.toBeInTheDocument();
    // ADMIN has nothing to offer on an inactive row, so the trigger itself is gone.
    expect(
      screen.queryByRole('button', { name: 'Acciones del término diagnóstico' }),
    ).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, una fila inactiva ofrece «Editar», «Ver auditoría» y «Reactivar»', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow({ isActive: false })]);
    renderPage('/diagnostic-terms?includeInactive=true');

    await screen.findAllByText('Fiebre');
    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ver auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, «Importar diccionario» lleva a la página de importación', async () => {
    signInAs('SUPERADMIN', 100);
    const user = setupUser();
    serveList([makeRow()]);
    const router = renderPage();

    await user.click(await screen.findByRole('link', { name: /importar diccionario/i }));

    expect(router.state.location.pathname).toBe('/diagnostic-terms/import');
  });

  it('con SUPERADMIN y el maestro vacío, el estado vacío ofrece importar y crear', async () => {
    signInAs('SUPERADMIN', 100);
    serveList([]);
    renderPage();

    expect(
      await screen.findByText('Todavía no hay términos diagnósticos registrados.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /importar diccionario/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /crear término/i }).length).toBeGreaterThan(0);
  });

  it('una fila PENDING lleva el badge «Pendiente»', async () => {
    signInAs('USER', 25);
    serveList([makeRow({ metadata: { reviewStatus: 'PENDING', autoCreated: true } })]);
    renderPage();

    await screen.findAllByText('Fiebre');
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
  });
});
