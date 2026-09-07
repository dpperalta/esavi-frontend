import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EventList } from './EventList';

const server = setupServer();

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVENT_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventList caseId="case-1" notificationId={NOTIFICATION_ID} />
    </QueryClientProvider>,
  );
}

function eventRow(overrides: Partial<Record<string, unknown>>) {
  return {
    eventId: EVENT_1,
    notificationId: NOTIFICATION_ID,
    diagnosticTermId: null,
    sortOrder: 1,
    esaviName: 'Fiebre alta',
    esaviCode: null,
    esaviRawName: null,
    isMainEsavi: false,
    startDate: null,
    startTime: null,
    isOtherEsavi: false,
    otherDescription: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    diagnosticTerm: null,
    ...overrides,
  };
}

describe('EventList — SPEC FE12b §4 paso 8', () => {
  it('sin fila de notification, la sección no está en el DOM', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EventList caseId="case-1" notificationId={null} />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('crear un evento envía esaviName y notificationId', async () => {
    const user = setupUser();
    server.use(
      http.get(`http://localhost:4500/api/notification-events/case/case-1`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-events', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: eventRow({}) });
      }),
      http.get('http://localhost:4500/api/meddra/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Diagnóstico del ESAVI'), 'Fiebre alta');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ esaviName: 'Fiebre alta', notificationId: NOTIFICATION_ID });
    // `esaviName` es ahora un `<MeddraSearchField>` (SPEC FE12b §4 paso 9): más pesado que un
    // `<input>` liso en este entorno, mismo motivo documentado en `src/test/user.ts`.
  }, 60000);

  it('marcar dos eventos como principales no desmarca ninguno: cada PUT toca sólo su propia fila', async () => {
    const user = setupUser();
    server.use(
      http.get(`http://localhost:4500/api/notification-events/case/case-1`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 2,
            rows: [
              eventRow({ eventId: EVENT_1, esaviName: 'Fiebre alta', sortOrder: 1 }),
              eventRow({ eventId: EVENT_2, esaviName: 'Convulsión febril', sortOrder: 2 }),
            ],
          },
        }),
      ),
    );
    const puts: { id: string; body: Record<string, unknown> }[] = [];
    server.use(
      http.put('http://localhost:4500/api/notification-events/:id', async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        puts.push({ id: String(params.id), body });
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: eventRow({ eventId: String(params.id), isMainEsavi: true }),
        });
      }),
    );

    renderList();

    // `<SatelliteList>` pinta la tabla completa y luego las tarjetas completas (SPEC FE12b §4
    // paso 4): con dos filas, los primeros dos checkboxes son la tabla — uno por fila, en orden.
    const checkboxes = await screen.findAllByRole('checkbox', { name: 'Evento principal' });
    expect(checkboxes).toHaveLength(4); // dos filas × (tabla + tarjeta)

    await user.click(checkboxes[0]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ id: EVENT_1, body: { isMainEsavi: true } });

    await user.click(checkboxes[1]);
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ id: EVENT_2, body: { isMainEsavi: true } });

    // Ninguna de las dos escrituras tocó la fila hermana, ni envió `isMainEsavi: false`.
    expect(puts.every((put) => put.body.isMainEsavi === true)).toBe(true);
    expect(puts.map((put) => put.id).sort()).toEqual([EVENT_1, EVENT_2].sort());
  });
});
