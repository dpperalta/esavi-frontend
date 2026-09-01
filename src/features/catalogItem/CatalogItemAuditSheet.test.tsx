import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { CatalogItem } from '@/contracts/declared/catalogItem';
import { CatalogItemAuditSheet } from './CatalogItemAuditSheet';

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

function makeRow(overrides: Partial<CatalogItem> = {}): CatalogItem {
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

function renderSheet(catalogItemId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CatalogItemAuditSheet open catalogItemId={catalogItemId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CatalogItemAuditSheet', () => {
  it('abre con una fila de varias entradas de appDetails', async () => {
    server.use(
      http.get('http://localhost:4500/api/catalog-items/ci-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({
            appDetails: [
              {
                createdAt: new Date('2026-08-20T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'POST',
                detail: 'Creación inicial',
              },
              {
                createdAt: new Date('2026-08-25T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'PUT',
                detail: 'Actualización de nombre',
              },
            ],
          }),
        }),
      ),
    );

    renderSheet('ci-1');

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('con appDetails: null no revienta y muestra el estado vacío', async () => {
    server.use(
      http.get('http://localhost:4500/api/catalog-items/ci-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ appDetails: null }) }),
      ),
    );

    renderSheet('ci-1');

    expect(await screen.findByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
