import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceTable, type ResourceTableColumn } from './ResourceTable';

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

interface Widget {
  widgetId: string;
  name: string;
}

const columns: ResourceTableColumn<Widget>[] = [
  { key: 'name', header: 'nav.items.catalogType', render: (row) => row.name, card: 'primary' },
];

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
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

function renderTable(props: Partial<React.ComponentProps<typeof ResourceTable<Widget>>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourceTable<Widget>
        columns={columns}
        data={{ count: 0, rows: [] }}
        idField="widgetId"
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        page={1}
        onPageChange={() => {}}
        inactiveMode="serverDecides"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ResourceTable — estado vacío', () => {
  it('con count: 0 muestra el estado vacío', () => {
    renderTable({ data: { count: 0, rows: [] } });

    expect(screen.getByText('No hay registros para mostrar.')).toBeInTheDocument();
  });

  it('muestra el estado vacío filtrado cuando isFiltered es true', () => {
    renderTable({ data: { count: 0, rows: [] }, isFiltered: true });

    expect(screen.getByText('Ningún registro coincide con los filtros.')).toBeInTheDocument();
  });
});

describe('ResourceTable — carga', () => {
  it('muestra el skeleton mientras isLoading es true', () => {
    renderTable({ isLoading: true, data: undefined });

    expect(screen.queryByText('No hay registros para mostrar.')).not.toBeInTheDocument();
  });
});

describe('ResourceTable — error', () => {
  it('muestra el mensaje resuelto por code y reintenta al hacer click', async () => {
    const user = setupUser();
    const onRetry = vi.fn();
    const error = new EsaviApiError('El servidor no respondió', 500, 'WIDGET_002_LIST_FAILED');

    renderTable({ isError: true, error, onRetry, data: undefined });

    expect(screen.getByText('El servidor no respondió')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('ResourceTable — toggle de inactivos (modo adminPath)', () => {
  it('con nivel USER, el toggle no se renderiza', async () => {
    signInAs('USER', 25);

    renderTable({
      inactiveMode: 'adminPath',
      includeInactive: false,
      onIncludeInactiveChange: () => {},
      data: { count: 1, rows: [{ widgetId: 'w1', name: 'Widget 1' }] },
    });

    await waitFor(() => expect(screen.getAllByText('Widget 1').length).toBeGreaterThan(0));
    expect(screen.queryByText('Mostrar inactivos')).not.toBeInTheDocument();
  });

  it('con nivel ADMIN, el toggle sí se renderiza', async () => {
    signInAs('ADMIN', 50);

    renderTable({
      inactiveMode: 'adminPath',
      includeInactive: false,
      onIncludeInactiveChange: () => {},
      data: { count: 1, rows: [{ widgetId: 'w1', name: 'Widget 1' }] },
    });

    await waitFor(() => expect(screen.getByText('Mostrar inactivos')).toBeInTheDocument());
  });

  it('en modo serverDecides, el toggle nunca se renderiza aunque el nivel sea ADMIN', async () => {
    signInAs('ADMIN', 50);

    renderTable({
      inactiveMode: 'serverDecides',
      data: { count: 1, rows: [{ widgetId: 'w1', name: 'Widget 1' }] },
    });

    await waitFor(() => expect(screen.getAllByText('Widget 1').length).toBeGreaterThan(0));
    expect(screen.queryByText('Mostrar inactivos')).not.toBeInTheDocument();
  });
});
