import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { Diluent } from '@/contracts/declared/diluent';
import { DiluentAuditSheet } from './DiluentAuditSheet';

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

function makeRow(overrides: Partial<Diluent> = {}): Diluent {
  return {
    diluentCatalogId: 'd-1',
    code: 'AGUA_DESTILADA',
    name: 'Agua destilada',
    description: null,
    composition: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSheet(diluentId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiluentAuditSheet open diluentId={diluentId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('DiluentAuditSheet', () => {
  it('lista las dos entradas de appDetails, la más reciente primero', async () => {
    server.use(
      http.get('http://localhost:4500/api/diluents/d-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({
            appDetails: [
              {
                createdAt: new Date('2026-09-20T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'POST',
                detail: 'Creación inicial',
              },
              {
                createdAt: new Date('2026-09-22T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'PUT',
                detail: 'Cambio de composición',
              },
            ],
          }),
        }),
      ),
    );

    renderSheet('d-1');

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Cambio de composición');
    expect(items[1]).toHaveTextContent('Creación inicial');
  });

  it('con appDetails: null muestra el estado vacío', async () => {
    server.use(
      http.get('http://localhost:4500/api/diluents/d-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ appDetails: null }) }),
      ),
    );

    renderSheet('d-1');

    expect(await screen.findByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
