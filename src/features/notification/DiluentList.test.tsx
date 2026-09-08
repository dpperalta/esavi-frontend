import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import '@/shared/config/i18n';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DiluentList } from './DiluentList';

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

function renderList(vaccineId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiluentList vaccineId={vaccineId} vaccinationDate={null} />
    </QueryClientProvider>,
  );
}

describe('DiluentList — SPEC FE12c §4 paso 9', () => {
  it('sin vaccineId, la sección sale deshabilitada con su explicación y no pide nada al servidor', () => {
    renderList(null);

    expect(screen.getByText('notificationDiluent.list.needsParent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notificationDiluent\.list\.add/ })).not.toBeInTheDocument();
  });

  it('dar de baja un diluyente pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    let deleteCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/notification-diluents/vaccine/v-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                diluentId: 'd-1',
                vaccineId: 'v-1',
                diluentCatalogId: null,
                sortOrder: 1,
                batchNumber: null,
                expirationDate: null,
                reconstitutionDate: null,
                reconstitutionTime: null,
                diluentName: 'Agua estéril',
                diluentCode: null,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: null,
                deletedAt: null,
                appDetails: [],
                diluentCatalog: null,
              },
            ],
          },
        }),
      ),
      http.delete('http://localhost:4500/api/notification-diluents/d-1', () => {
        deleteCalls++;
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    const user = setupUser();
    renderList('v-1');

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Agua estéril' });
    await user.click(deleteButton);

    expect(await screen.findByText('notificationDiluent.delete.confirm', { exact: false })).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });
});
