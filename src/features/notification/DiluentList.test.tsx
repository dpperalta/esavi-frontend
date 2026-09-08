import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderList(vaccineId: string | null, vaccinationDate: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiluentList vaccineId={vaccineId} vaccinationDate={vaccinationDate} />
    </QueryClientProvider>,
  );
}

describe('DiluentList — SPEC FE12c §4 paso 9', () => {
  it('sin vaccineId, la sección sale deshabilitada con su explicación y no pide nada al servidor', () => {
    renderList(null);

    expect(screen.getByText('Guarda la vacuna antes de añadir sus diluyentes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir diluyente' })).not.toBeInTheDocument();
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

    expect(
      await screen.findByText('¿Dar de baja «Agua estéril»? Esta acción no se puede deshacer desde aquí.'),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it('reconstitutionDate posterior a vaccinationDate bloquea el guardado con el error de coherencia temporal (§3.5)', async () => {
    let diluentPosted = false;
    server.use(
      http.get('http://localhost:4500/api/notification-diluents/vaccine/v-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/notification-diluents', () => {
        diluentPosted = true;
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    const user = setupUser();
    renderList('v-1', '2026-03-10');

    await user.click(await screen.findByRole('button', { name: 'Añadir diluyente' }));
    await user.type(screen.getByLabelText('Nombre del diluyente'), 'Agua estéril');
    fireEvent.change(screen.getByLabelText('Fecha de reconstitución'), { target: { value: '2026-03-15' } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('La fecha de reconstitución no puede ser posterior a la fecha de vacunación.'),
    ).toBeInTheDocument();
    expect(diluentPosted).toBe(false);
  });
});
