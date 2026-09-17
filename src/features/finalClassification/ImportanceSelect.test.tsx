import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { ImportanceSelect } from './ImportanceSelect';

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

const IMPORTANCE_TYPE = {
  catalogTypeId: 'type-importance',
  code: 'finalClassificationImportance',
  name: 'Importancia',
  description: null,
  sortOrder: 1,
  isActive: true,
  deletedAt: null,
  appDetails: [],
};

function importanceItem(overrides: Record<string, unknown> = {}) {
  return {
    catalogItemId: 'item-1',
    catalogTypeId: 'type-importance',
    code: 'IMPORTANCE_1',
    name: 'Importancia 1',
    value: '1',
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

function mockCatalogTypes() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [IMPORTANCE_TYPE] } }),
    ),
  );
}

function mockCatalogItems() {
  server.use(
    http.get('http://localhost:4500/api/catalog-items/type/type-importance', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 3,
          rows: [
            importanceItem(),
            importanceItem({ catalogItemId: 'item-2', code: 'IMPORTANCE_2', name: 'Importancia 2', value: '2', sortOrder: 2 }),
            importanceItem({ catalogItemId: 'item-3', code: 'IMPORTANCE_3', name: 'Importancia 3', value: '3', sortOrder: 3 }),
          ],
        },
      }),
    ),
  );
}

function renderSelect(props: {
  value?: string | null;
  onChange?: (id: string | null) => void;
  releasedToBlock?: 'A' | 'B' | 'C' | null;
  disabled?: boolean;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportanceSelect
        label="Importancia A"
        value={props.value ?? null}
        onChange={props.onChange ?? vi.fn()}
        releasedToBlock={props.releasedToBlock ?? null}
        disabled={props.disabled}
      />
    </QueryClientProvider>,
  );
}

describe('ImportanceSelect', () => {
  it('pinta los tres ítems del catálogo finalClassificationImportance', async () => {
    mockCatalogTypes();
    mockCatalogItems();

    renderSelect({});

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    const user = setupUser();
    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Importancia 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Importancia 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Importancia 3' })).toBeInTheDocument();
  });

  it('con releasedToBlock informado muestra el aviso en aria-live', async () => {
    mockCatalogTypes();
    mockCatalogItems();

    renderSelect({ releasedToBlock: 'A' });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('sin releasedToBlock no muestra ningún aviso', async () => {
    mockCatalogTypes();
    mockCatalogItems();

    renderSelect({ releasedToBlock: null });

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('elegir un valor emite su catalogItemId, no su code', async () => {
    mockCatalogTypes();
    mockCatalogItems();
    const onChange = vi.fn();
    const user = setupUser();

    renderSelect({ onChange });

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Importancia 2' }));

    expect(onChange).toHaveBeenCalledWith('item-2');
  });

  it('disabled no admite interacción', async () => {
    mockCatalogTypes();
    mockCatalogItems();

    renderSelect({ disabled: true });

    const select = await screen.findByRole('combobox');
    expect(select).toBeDisabled();
  });
});
