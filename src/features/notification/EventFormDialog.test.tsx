import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EventFormDialog } from './EventFormDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function renderDialog(eventId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventFormDialog open notificationId={NOTIFICATION_ID} eventId={eventId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

function mockMeddraSearch() {
  server.use(
    http.get('http://localhost:4500/api/meddra/search', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: 1, rows: [{ code: 'FIEBRE01', name: 'Fiebre alta', termGroup: 'PT' }] },
      }),
    ),
  );
}

function baseEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventId: EVENT_ID,
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

describe('EventFormDialog — SPEC FE12b §4 paso 9', () => {
  it('elegir un término de MedDRA envía source: MEDDRA', async () => {
    const user = setupUser();
    mockMeddraSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-events', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseEventRow() });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Diagnóstico del ESAVI'), 'Fie');
    await user.click(await screen.findByRole('option', { name: /Fiebre alta/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      esaviName: 'Fiebre alta',
      esaviCode: 'FIEBRE01',
      source: 'MEDDRA',
    });
  }, 60000);

  it('teclear un código a mano envía source: LOCAL', async () => {
    const user = setupUser();
    mockMeddraSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-events', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseEventRow() });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Diagnóstico del ESAVI'), 'Fiebre no catalogada');
    await user.type(screen.getByLabelText('Código'), 'FIEBRE-X');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      esaviName: 'Fiebre no catalogada',
      esaviCode: 'FIEBRE-X',
      source: 'LOCAL',
    });
  }, 60000);

  it('sin código, source no viaja en el cuerpo', async () => {
    const user = setupUser();
    mockMeddraSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-events', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseEventRow() });
      }),
    );

    renderDialog();

    const nameField = await screen.findByLabelText('Diagnóstico del ESAVI');
    await user.type(nameField, 'Fiebre alta');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).not.toHaveProperty('source');
  }, 60000);

  it('reabrir un evento cuyo maestro reescribió el nombre muestra esaviRawName, no esaviName', async () => {
    server.use(
      http.get(`http://localhost:4500/api/notification-events/${EVENT_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: baseEventRow({
            esaviName: 'Fiebre alta',
            esaviRawName: 'fiebre altisima',
            esaviCode: 'FIEBRE01',
          }),
        }),
      ),
    );

    renderDialog(EVENT_ID);

    expect(await screen.findByDisplayValue('fiebre altisima')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Fiebre alta')).not.toBeInTheDocument();
  }, 60000);

  it('un PUT sin tocar nada reenvía el mismo esaviCode, sin perderlo ni recalcularlo', async () => {
    server.use(
      http.get(`http://localhost:4500/api/notification-events/${EVENT_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: baseEventRow({
            esaviName: 'Fiebre alta',
            esaviRawName: 'fiebre altisima',
            esaviCode: 'FIEBRE01',
          }),
        }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/notification-events/${EVENT_ID}`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseEventRow() });
      }),
    );

    const user = setupUser();
    renderDialog(EVENT_ID);

    await screen.findByDisplayValue('fiebre altisima');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ esaviName: 'fiebre altisima', esaviCode: 'FIEBRE01' });
  }, 60000);

  // SPEC FE12b §4 paso 13 — el aviso de administrador de §10.4, no un toast genérico.
  it('un 403 AUTH_ROLE_FORBIDDEN en el PUT muestra el aviso de administrador, no un toast genérico', async () => {
    server.use(
      http.get(`http://localhost:4500/api/notification-events/${EVENT_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseEventRow() }),
      ),
      http.put(`http://localhost:4500/api/notification-events/${EVENT_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Rol insuficiente', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    const user = setupUser();
    renderDialog(EVENT_ID);

    await screen.findByDisplayValue('Fiebre alta');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'Corregir este contenido clínico exige un administrador en este despliegue.',
    );
  }, 60000);
});
