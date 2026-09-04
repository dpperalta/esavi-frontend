import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CatalogSelect } from './CatalogSelect';

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

const WORKFLOW_STATUS_TYPE = {
  catalogTypeId: 'type-workflow-status',
  code: 'caseWorkflowStatus',
  name: 'Estado del expediente',
  description: null,
  sortOrder: 1,
  isActive: true,
  deletedAt: null,
  appDetails: [],
};

function statusItem(overrides: Record<string, unknown> = {}) {
  return {
    catalogItemId: 'item-open',
    catalogTypeId: 'type-workflow-status',
    code: 'OPEN',
    name: 'Abierto',
    value: null,
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

function mockCatalogTypes(requestCounter?: { count: number }) {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () => {
      if (requestCounter) requestCounter.count += 1;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: 1, rows: [WORKFLOW_STATUS_TYPE] },
      });
    }),
  );
}

function mockCatalogItems(requestCounter?: { count: number }) {
  server.use(
    http.get('http://localhost:4500/api/catalog-items/type/type-workflow-status', () => {
      if (requestCounter) requestCounter.count += 1;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: 2, rows: [statusItem(), statusItem({ catalogItemId: 'item-closed', code: 'CLOSED', name: 'Cerrado', sortOrder: 2 })] },
      });
    }),
  );
}

function renderSelect(props: { typeCode?: string; value?: string | null; onChange?: (id: string | null) => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CatalogSelect
          typeCode={props.typeCode ?? 'caseWorkflowStatus'}
          value={props.value ?? null}
          onChange={props.onChange ?? vi.fn()}
          ariaLabel="Estado del expediente"
        />
      </QueryClientProvider>,
    ),
  };
}

describe('CatalogSelect', () => {
  it('pinta los estados del catálogo caseWorkflowStatus', async () => {
    mockCatalogTypes();
    mockCatalogItems();

    renderSelect({});

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    const user = setupUser();
    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Abierto' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cerrado' })).toBeInTheDocument();
  });

  it('dos instancias con el mismo typeCode comparten caché y hacen una petición por salto', async () => {
    const typeCalls = { count: 0 };
    const itemCalls = { count: 0 };
    mockCatalogTypes(typeCalls);
    mockCatalogItems(itemCalls);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CatalogSelect typeCode="caseWorkflowStatus" value={null} onChange={vi.fn()} ariaLabel="Estado 1" />
        <CatalogSelect typeCode="caseWorkflowStatus" value={null} onChange={vi.fn()} ariaLabel="Estado 2" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));
    expect(typeCalls.count).toBe(1);
    expect(itemCalls.count).toBe(1);
  });

  it('un typeCode inexistente deja el selector vacío y deshabilitado, sin romper la pantalla', async () => {
    mockCatalogTypes();

    renderSelect({ typeCode: 'doesNotExist' });

    const select = await screen.findByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('emite el code del item elegido, no su catalogItemId', async () => {
    mockCatalogTypes();
    mockCatalogItems();
    const onChange = vi.fn();
    const user = setupUser();

    renderSelect({ onChange });

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Cerrado' }));

    expect(onChange).toHaveBeenCalledWith('CLOSED');
  });
});
