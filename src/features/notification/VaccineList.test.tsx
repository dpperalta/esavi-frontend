import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { notificationDiluentsByVaccineKey } from './api';
import { VaccineList } from './VaccineList';

const server = setupServer();

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function renderList(notificationId: string | null = NOTIFICATION_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <VaccineList caseId="case-1" notificationId={notificationId} eventDate={null} />
      </QueryClientProvider>,
    ),
  };
}

function vaccineRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    vaccineId: 'v-1',
    notificationId: NOTIFICATION_ID,
    vaccineWhodrugId: null,
    sortOrder: 1,
    isSuspected: false,
    whoCode: null,
    vaccineCode: null,
    vaccineName: 'BCG',
    vaccinationDate: '2026-03-10',
    vaccinationTime: null,
    doseNumber: 1,
    batchNumber: null,
    expirationDate: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    vaccineWhodrug: null,
    ...overrides,
  };
}

describe('VaccineList — SPEC FE12c §4 paso 7', () => {
  it('sin fila de notification, la sección no está en el DOM', () => {
    const { container } = renderList(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('un caso con vacunas cargadas las lista en orden de creación (sortOrder)', async () => {
    server.use(
      http.get('http://localhost:4500/api/notification-vaccines/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 2,
            rows: [
              vaccineRow({ vaccineId: 'v-1', vaccineName: 'BCG', sortOrder: 1 }),
              vaccineRow({ vaccineId: 'v-2', vaccineName: 'Pentavalente', sortOrder: 2 }),
            ],
          },
        }),
      ),
    );

    renderList();

    await screen.findAllByText('BCG');
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1); // sin la fila de encabezado
    expect(within(rows[0]).getByText('BCG')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Pentavalente')).toBeInTheDocument();
  });

  it('la tarjeta móvil muestra vaccineName, vaccinationDate y doseNumber, y el distintivo de sospechosa aparte', async () => {
    server.use(
      http.get('http://localhost:4500/api/notification-vaccines/case/case-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [vaccineRow({ isSuspected: true, doseNumber: 2 })] },
        }),
      ),
    );

    renderList();
    await screen.findAllByText('BCG');

    // La tarjeta móvil y la fila de escritorio conviven en el DOM (sólo CSS las alterna por
    // viewport, SPEC FE12c §3.7); el body no admite scroll horizontal se comprueba a mano, en
    // tema real, por debajo de `md` — no es observable en jsdom.
    expect(screen.getAllByText('10/03/2026').length).toBeGreaterThanOrEqual(2);
    // `doseNumber` aparece dos veces: en la celda de la tabla y en la línea de la tarjeta.
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2);
    // El distintivo de sospechosa existe (aparece en la columna de escritorio y en la tarjeta),
    // nunca como una cuarta línea de campo dentro de la tarjeta — lo prueba `cardBadge`, no
    // `columns`.
    expect(screen.getAllByText('notificationVaccine.badge.suspected').length).toBeGreaterThanOrEqual(2);
  });

  it(
    'dar de baja una vacuna con dos diluyentes advierte nombrándolos, y sólo invalida la clave de diluyentes de esa vacuna',
    async () => {
      let deleteCalls = 0;
      server.use(
        http.get('http://localhost:4500/api/notification-vaccines/case/case-1', () =>
          HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [vaccineRow({})] } }),
        ),
        http.get('http://localhost:4500/api/notification-diluents/vaccine/v-1', () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 2,
              rows: [
                { diluentId: 'd-1', vaccineId: 'v-1', diluentCatalogId: null, sortOrder: 1, batchNumber: null, expirationDate: null, reconstitutionDate: null, reconstitutionTime: null, diluentName: 'Agua estéril', diluentCode: null, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null, deletedAt: null, appDetails: [], diluentCatalog: null },
                { diluentId: 'd-2', vaccineId: 'v-1', diluentCatalogId: null, sortOrder: 2, batchNumber: null, expirationDate: null, reconstitutionDate: null, reconstitutionTime: null, diluentName: 'Suero fisiológico', diluentCode: null, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null, deletedAt: null, appDetails: [], diluentCatalog: null },
              ],
            },
          }),
        ),
        http.delete('http://localhost:4500/api/notification-vaccines/v-1', () => {
          deleteCalls++;
          return HttpResponse.json({ ok: true, message: 'ok' });
        }),
      );

      const { queryClient } = renderList();
      const user = setupUser();

      const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar BCG' });
      await user.click(deleteButton);

      expect(
        await screen.findByText('notificationVaccine.delete.confirmWithDiluents', { exact: false }),
      ).toBeInTheDocument();
      expect(deleteCalls).toBe(0);

      const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
      await user.click(confirmButton);

      await waitFor(() => expect(deleteCalls).toBe(1));
      await waitFor(() =>
        expect(
          queryClient.getQueryState(notificationDiluentsByVaccineKey('v-1'))?.isInvalidated,
        ).toBe(true),
      );
    },
    30000,
  );
});
