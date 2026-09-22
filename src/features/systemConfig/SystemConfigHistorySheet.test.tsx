import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { SystemConfigHistorySheet } from './SystemConfigHistorySheet';

const server = setupServer();
const SC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function renderSheet(open = true, systemConfigId: string | null = SC_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemConfigHistorySheet open={open} systemConfigId={systemConfigId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('SystemConfigHistorySheet — SPEC FE19 §4 paso 7', () => {
  it('una fila recién creada muestra exactamente una entrada, con "Antes" vacío', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}/history`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                systemConfigHistoryId: 'h-1',
                systemConfigId: SC_ID,
                previousValue: null,
                newValue: 42,
                changeReason: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                changedByUser: { userId: 'u-1', displayName: 'Ana Pérez' },
              },
            ],
          },
        }),
      ),
    );

    renderSheet();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('un autor con la FK en null muestra "Autor no disponible"', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}/history`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                systemConfigHistoryId: 'h-1',
                systemConfigId: SC_ID,
                previousValue: 10,
                newValue: 20,
                changeReason: 'Ajuste acordado',
                createdAt: '2026-01-01T00:00:00.000Z',
                changedByUser: null,
              },
            ],
          },
        }),
      ),
    );

    renderSheet();

    expect(await screen.findByText('Autor no disponible')).toBeInTheDocument();
    expect(screen.getByText('Ajuste acordado')).toBeInTheDocument();
  });

  it('sin historial, muestra el estado vacío', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}/history`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderSheet();

    expect(
      await screen.findByText('Esta configuración todavía no cambió de valor.'),
    ).toBeInTheDocument();
  });

  it('cerrado no pide el historial', () => {
    let requested = false;
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}/history`, () => {
        requested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderSheet(false);

    expect(requested).toBe(false);
  });

  it('la paginación no aparece en la URL y avanza de página sin recargarla', async () => {
    const user = setupUser();
    const receivedOffsets: string[] = [];
    const manyRows = Array.from({ length: 25 }, (_, index) => ({
      systemConfigHistoryId: `h-${index}`,
      systemConfigId: SC_ID,
      previousValue: index,
      newValue: index + 1,
      changeReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      changedByUser: { userId: 'u-1', displayName: `Autor ${index}` },
    }));
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}/history`, ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const limit = Number(url.searchParams.get('limit'));
        receivedOffsets.push(url.searchParams.get('offset') ?? '0');
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: manyRows.length, rows: manyRows.slice(offset, offset + limit) },
        });
      }),
    );

    renderSheet();

    expect(await screen.findByText('Autor 0')).toBeInTheDocument();
    expect(window.location.search).toBe('');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(screen.getByText('Autor 20')).toBeInTheDocument());
    expect(window.location.search).toBe('');
    expect(receivedOffsets).toContain('20');
  });
});
