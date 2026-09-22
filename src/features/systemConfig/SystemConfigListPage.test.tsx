import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import { SystemConfigListPage } from './SystemConfigListPage';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  toastSuccess.mockClear();
  toastError.mockClear();
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function makeRow(overrides: Partial<SystemConfigDetail> = {}): SystemConfigDetail {
  return {
    systemConfigId: 'sc-1',
    code: 'ESAVI_MAX_UPLOAD_SIZE',
    name: 'Tamaño máximo de carga',
    description: null,
    value: 10,
    valueType: 'number',
    scope: 'GLOBAL',
    isEncrypted: false,
    isEditable: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderPage(initialPath = '/system-configs') {
  const router = createMemoryRouter(
    [{ path: '/system-configs', element: <SystemConfigListPage /> }],
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

describe('SystemConfigListPage — SPEC FE19 §4 paso 6', () => {
  it('sin filas y sin filtros, ofrece «Sembrar configuraciones» en vez de un listado vacío genérico', async () => {
    server.use(
      http.get('http://localhost:4500/api/system-configs', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText('Todavía no hay configuraciones. Siembra el catálogo inicial para empezar.'),
    ).toBeInTheDocument();
    // Dos apariciones: la cabecera (siempre visible) y el panel vacío.
    expect(screen.getAllByRole('button', { name: 'Sembrar configuraciones' }).length).toBe(2);
  });

  it('una fila cifrada muestra el candado y nunca el valor', async () => {
    server.use(
      http.get('http://localhost:4500/api/system-configs', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeRow({ isEncrypted: true, value: null })] },
        }),
      ),
    );

    renderPage();

    expect(await screen.findAllByText('Cifrado')).not.toHaveLength(0);
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('una fila protegida (isEditable: false) lleva el badge «Protegida»', async () => {
    server.use(
      http.get('http://localhost:4500/api/system-configs', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeRow({ isEditable: false })] },
        }),
      ),
    );

    renderPage();

    expect(await screen.findAllByText('Protegida')).not.toHaveLength(0);
  });

  it('aplicar el filtro de código y recargar en la misma URL reproduce la vista', async () => {
    const user = setupUser();
    const receivedCodes: (string | null)[] = [];
    server.use(
      http.get('http://localhost:4500/api/system-configs', ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        receivedCodes.push(code);
        const rows = code ? [makeRow({ code: 'ESAVI_MAX_UPLOAD_SIZE' })] : [];
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
      }),
    );

    const router = renderPage();

    await waitFor(() => expect(receivedCodes).toContain(null));

    await user.type(screen.getByLabelText('Código'), 'UPLOAD');

    await waitFor(() => expect(router.state.location.search).toBe('?code=UPLOAD'));
    await waitFor(() => expect(receivedCodes).toContain('UPLOAD'));

    // "El enlace reproduce la misma vista": un montaje nuevo en la misma URL pide el mismo filtro.
    renderPage('/system-configs?code=UPLOAD');

    await waitFor(() => expect(receivedCodes.filter((c) => c === 'UPLOAD').length).toBeGreaterThan(1));
  });

  it('sembrar hace POST /sync y muestra un toast con lo creado y lo omitido', async () => {
    const user = setupUser();
    let syncCalled = false;
    server.use(
      http.get('http://localhost:4500/api/system-configs', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/system-configs/sync', () => {
        syncCalled = true;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { created: [{ code: 'A', scope: 'GLOBAL' }], skipped: [{ code: 'B', scope: 'GLOBAL' }] },
        });
      }),
    );

    renderPage();

    const [firstTrigger] = await screen.findAllByRole('button', { name: 'Sembrar configuraciones' });
    await user.click(firstTrigger);

    const buttonsWithDialogOpen = await screen.findAllByRole('button', {
      name: 'Sembrar configuraciones',
    });
    await user.click(buttonsWithDialogOpen[buttonsWithDialogOpen.length - 1]);

    await waitFor(() => expect(syncCalled).toBe(true));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Se crearon 1 configuraciones; 1 ya existían.'));
  });
});
