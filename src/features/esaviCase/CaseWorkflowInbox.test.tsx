import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWorkflowInbox } from './CaseWorkflowInbox';

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

function mockCurrentUser(roleName: string, level: number) {
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

function mockCatalogStatusSelect() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogTypeId: 'type-status',
              code: 'caseWorkflowStatus',
              name: 'Estado',
              description: null,
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
    http.get('http://localhost:4500/api/catalog-items/type/type-status', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function workflowRow(overrides: Record<string, unknown> = {}) {
  const stage = { exists: true, id: 's-1', startedAt: '2026-01-01', endedAt: '2026-01-02', durationMinutes: 60 };
  const pendingStage = { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null };
  return {
    caseWorkflowId: 'wf-1',
    caseId: 'case-1',
    caseCode: 'ESAVI-0001',
    status: { catalogItemId: 'item-open', code: 'OPEN', name: 'Abierto' },
    previousStatus: null,
    openedAt: '2026-01-01T10:00:00.000Z',
    closedAt: null,
    lastReopenedAt: null,
    reopenCount: 0,
    stages: {
      classification: stage,
      notification: stage,
      investigation: pendingStage,
      finalClassification: pendingStage,
    },
    totalDurationMinutes: null,
    isActive: true,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderInbox(initialPath = '/esavi-cases?tab=workflow') {
  const router = createMemoryRouter([{ path: '/esavi-cases', element: <CaseWorkflowInbox /> }], {
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

describe('CaseWorkflowInbox', () => {
  it('caseCode: null se pinta como ausencia, nunca como cadena vacía ni error', async () => {
    mockCurrentUser('USER', 25);
    mockCatalogStatusSelect();
    server.use(
      http.get('http://localhost:4500/api/case-workflows', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [workflowRow({ caseCode: null })] },
        }),
      ),
    );

    renderInbox();

    const missing = await screen.findAllByText('Sin código');
    expect(missing.length).toBeGreaterThan(0);
    expect(screen.queryByText('No pudimos cargar los datos.')).not.toBeInTheDocument();
  });

  it('un statusCode inexistente limpia el filtro y avisa en línea, sin pantalla de error', async () => {
    mockCurrentUser('USER', 25);
    mockCatalogStatusSelect();
    let sawStatusCode: string | null = 'not-called';
    server.use(
      http.get('http://localhost:4500/api/case-workflows', ({ request }) => {
        const params = new URL(request.url).searchParams;
        sawStatusCode = params.get('statusCode');
        if (sawStatusCode) {
          return HttpResponse.json(
            { ok: false, message: 'Status not found', code: 'CASEFLOW_002_STATUS_NOT_FOUND' },
            { status: 404 },
          );
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const router = renderInbox('/esavi-cases?tab=workflow&statusCode=DOES_NOT_EXIST');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ese estado no existe en el catálogo.');
    // The tabla no cambia a la pantalla de error genérica.
    expect(screen.queryByText('No pudimos cargar los datos.')).not.toBeInTheDocument();

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.has('statusCode')).toBe(false);
    });
  });

  it('la fila enlaza a /esavi-cases/:caseId', async () => {
    mockCurrentUser('USER', 25);
    mockCatalogStatusSelect();
    server.use(
      http.get('http://localhost:4500/api/case-workflows', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [workflowRow()] },
        }),
      ),
    );

    renderInbox();

    const links = await screen.findAllByRole('button', { name: 'ESAVI-0001' });
    expect(links.length).toBeGreaterThan(0);
  });

  it('el progreso muestra cuántas de las cuatro etapas tienen endedAt', async () => {
    mockCurrentUser('USER', 25);
    mockCatalogStatusSelect();
    server.use(
      http.get('http://localhost:4500/api/case-workflows', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [workflowRow()] },
        }),
      ),
    );

    renderInbox();

    const progress = await screen.findAllByText('2/4 etapas');
    expect(progress.length).toBeGreaterThan(0);
  });
});
