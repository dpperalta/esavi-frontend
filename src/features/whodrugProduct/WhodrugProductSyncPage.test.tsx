import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { WhodrugProductSyncReport } from '@/contracts/whodrugProduct';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { WhodrugProductSyncPage } from './WhodrugProductSyncPage';

const API = 'http://localhost:4500/api';
const SYNC_URL = `${API}/whodrug-products/sync`;
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
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          roles: [{ roleId: 'r1', name: 'SUPERADMIN', code: 'SUPERADMIN', level: 100 }],
        },
      }),
    ),
  );
});

// Returns a probe of whether the empty-mirror check has been answered.
function serveMirrorCount(count: number) {
  const served = { current: false };
  server.use(
    http.get(`${API}/whodrug-products/admin`, () => {
      served.current = true;
      return HttpResponse.json({ ok: true, message: 'ok', data: { count, rows: [] } });
    }),
  );
  return served;
}

function buildReport(overrides: Partial<WhodrugProductSyncReport> = {}): WhodrugProductSyncReport {
  return {
    downloaded: 10,
    flattened: 40,
    inserted: 38,
    updated: 0,
    unchanged: 0,
    deactivated: 0,
    invalid: 1,
    duplicated: 1,
    dryRun: true,
    errors: [
      { drugCode: null, reason: 'EMPTY_DRUG_CODE' },
      { drugCode: '000002', reason: 'VALUE_TOO_LONG', column: 'maHolders' },
    ],
    ...overrides,
  };
}

function serveSyncError(status: number, code: string) {
  server.use(
    http.post(SYNC_URL, () =>
      HttpResponse.json({ ok: false, message: 'server says', code, errors: {} }, { status }),
    ),
  );
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/whodrug-products/sync', element: <WhodrugProductSyncPage /> },
      { path: '/whodrug-products', element: <p>listado</p> },
      { path: '/system-configs', element: <p>configuración</p> },
    ],
    { initialEntries: ['/whodrug-products/sync'] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('WhodrugProductSyncPage — ESAVI-WHODPROD-007 (SPEC FE25d §3.5)', () => {
  it('«Simular» envía dryRun: true como booleano JSON y pinta los ocho contadores en orden', async () => {
    serveMirrorCount(5);
    let body: unknown = null;
    server.use(
      http.post(SYNC_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );
    const user = setupUser();
    renderPage();

    await user.type(screen.getByLabelText('Versión del diccionario'), 'WHODrug Global 2025 Sep 1');
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    await screen.findByText('Simulación: no se escribió nada.');
    expect(body).toEqual({ dictionaryVersion: 'WHODrug Global 2025 Sep 1', dryRun: true });
    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    expect(terms).toEqual([
      'Descargados',
      'Filas generadas',
      'Insertadas',
      'Actualizadas',
      'Sin cambios',
      'Retiradas',
      'Rechazadas',
      'Duplicadas',
    ]);
    // A simulation offers no way to the list: nothing was written.
    expect(screen.queryByRole('link', { name: 'Ver medicamentos' })).not.toBeInTheDocument();
  });

  it('pinta los rechazos con motivo traducido y columna solo en VALUE_TOO_LONG', async () => {
    serveMirrorCount(5);
    server.use(
      http.post(SYNC_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport() }),
      ),
    );
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const table = await screen.findByRole('table', { name: 'Filas rechazadas' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first!).getByText('Sin código de fármaco')).toBeInTheDocument();
    expect(within(second!).getByText('Valor demasiado largo')).toBeInTheDocument();
    expect(within(second!).getByText('maHolders')).toBeInTheDocument();
  });

  it('con count: 0 en el 002B, la confirmación recomienda simular', async () => {
    serveMirrorCount(0);
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));

    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(
        within(dialog).getByText('Es la primera sincronización: se recomienda simular antes.'),
      ).toBeInTheDocument(),
    );
  });

  it('con count: 5 en el 002B, la confirmación no recomienda simular', async () => {
    const probe = serveMirrorCount(5);
    const user = setupUser();
    renderPage();

    await waitFor(() => expect(probe.current).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).queryByText('Es la primera sincronización: se recomienda simular antes.'),
    ).not.toBeInTheDocument();
  });

  it('confirmar envía dryRun: false y ofrece «Ver medicamentos»', async () => {
    serveMirrorCount(5);
    let body: unknown = null;
    server.use(
      http.post(SYNC_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: buildReport({ dryRun: false }),
        });
      }),
    );
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sincronizar' }));

    expect(await screen.findByRole('link', { name: 'Ver medicamentos' })).toBeInTheDocument();
    expect(body).toEqual({ dryRun: false });
  });

  it('un 503 WHODPROD_007_DISABLED muestra el alert con el enlace a /system-configs?scope=WHODRUG', async () => {
    serveMirrorCount(0);
    serveSyncError(503, 'WHODPROD_007_DISABLED');
    const user = setupUser();
    const router = renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('La sincronización con WHODrug está desactivada en este despliegue.'),
    ).toBeInTheDocument();
    await user.click(
      within(alert).getByRole('link', { name: 'Revisar la configuración de WHODrug' }),
    );
    expect(router.state.location.pathname).toBe('/system-configs');
    expect(router.state.location.search).toBe('?scope=WHODRUG');
  });

  it('un 503 WHODPROD_007_NOT_CONFIGURED también ofrece el enlace', async () => {
    serveMirrorCount(0);
    serveSyncError(503, 'WHODPROD_007_NOT_CONFIGURED');
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('link', { name: 'Revisar la configuración de WHODrug' }),
    ).toBeInTheDocument();
  });

  it('un 409 ALREADY_RUNNING muestra su alert, sin enlace', async () => {
    serveMirrorCount(5);
    serveSyncError(409, 'WHODPROD_007_ALREADY_RUNNING');
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Ya hay una sincronización en curso; espera a que termine.'),
    ).toBeInTheDocument();
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
  });

  it('mientras corre deshabilita los botones y avisa en una región aria-live', async () => {
    serveMirrorCount(5);
    let release: () => void = () => {};
    server.use(
      http.post(SYNC_URL, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const notice = await screen.findByText(/No cierres esta pestaña/);
    expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeDisabled();

    release();
    await screen.findByText('Simulación: no se escribió nada.');
  });

  it('cambiar dictionaryVersion tras simular descarta el informe', async () => {
    serveMirrorCount(5);
    server.use(
      http.post(SYNC_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport() }),
      ),
    );
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByText('Simulación: no se escribió nada.');

    await user.type(screen.getByLabelText('Versión del diccionario'), 'X');

    expect(screen.queryByText('Simulación: no se escribió nada.')).not.toBeInTheDocument();
  });
});
