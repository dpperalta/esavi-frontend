import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MedicationList } from './MedicationList';

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
const MEDICATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  toastError.mockClear();
  toastSuccess.mockClear();
});

function medicationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    medicationId: MEDICATION_1,
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
    ...overrides,
  };
}

function renderList(takesMedication: 'YES' | null = 'YES') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationList caseId="case-1" notificationId={NOTIFICATION_ID} takesMedication={takesMedication} />
    </QueryClientProvider>,
  );
}

describe('MedicationList — SPEC FE12b §4 paso 10', () => {
  it('sin fila de notification, la sección no está en el DOM', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MedicationList caseId="case-1" notificationId={null} takesMedication={null} />
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
        return HttpResponse.json({ ok: true, message: 'ok', data: medicationRow() });
      }),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Medicamento'), 'Paracetamol');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ medicationName: 'Paracetamol', notificationId: NOTIFICATION_ID });
  }, 60000);

  // SPEC FE12b §4 paso 14 — la baja con confirmación que nombra la fila.
  it('dar de baja pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    const user = setupUser();
    server.use(
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [medicationRow()] } }),
      ),
    );
    let deleteCalls = 0;
    server.use(
      http.delete(`http://localhost:4500/api/notification-medications/${MEDICATION_1}`, () => {
        deleteCalls++;
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    renderList();

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Paracetamol' });
    await user.click(deleteButton);

    expect(
      await screen.findByText('¿Dar de baja «Paracetamol»? Esta acción no se puede deshacer desde aquí.'),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  // SPEC FE12b §4 paso 14 — el bloqueo por rol en el 005A: un 403 explica, no un toast genérico.
  it('un 403 AUTH_ROLE_FORBIDDEN al confirmar la baja muestra el aviso de administrador', async () => {
    const user = setupUser();
    server.use(
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [medicationRow()] } }),
      ),
      http.delete(`http://localhost:4500/api/notification-medications/${MEDICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Rol insuficiente', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    renderList();

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Paracetamol' });
    await user.click(deleteButton);
    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'Retirar este contenido clínico exige un administrador en este despliegue.',
    );
  });
});
