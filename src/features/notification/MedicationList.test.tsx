import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MedicationList } from './MedicationList';

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

describe('MedicationList — SPEC FE12b §4 paso 10', () => {
  it('sin fila de notification, la sección no está en el DOM', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MedicationList caseId="case-1" notificationId={null} />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('crear una medicación envía medicationName y notificationId', async () => {
    const user = setupUser();
    server.use(
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get('http://localhost:4500/api/whodrug-products/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { term: 'par', count: 0, rows: [] } }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            medicationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            notificationId: NOTIFICATION_ID,
            sortOrder: 1,
            medicationName: 'Paracetamol',
            medicationCode: null,
            dose: null,
            pharmaceuticalFormItemId: null,
            administrationRouteItemId: null,
            startDate: null,
            isOtherMedication: false,
            otherMedicationText: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
            pharmaceuticalForm: null,
            administrationRoute: null,
          },
        });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MedicationList caseId="case-1" notificationId={NOTIFICATION_ID} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Medicamento'), 'Paracetamol');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ medicationName: 'Paracetamol', notificationId: NOTIFICATION_ID });
  }, 60000);
});
