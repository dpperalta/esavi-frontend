import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MedicationFormDialog } from './MedicationFormDialog';

const server = setupServer();

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEDICATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function mockEmptyCatalogs() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockWhodrugSearch() {
  server.use(
    http.get('http://localhost:4500/api/whodrug-products/search', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { term: 'par', count: 1, rows: [{ code: 'PAR001', name: 'Paracetamol' }] },
      }),
    ),
  );
}

function renderDialog(medicationId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationFormDialog
        open
        notificationId={NOTIFICATION_ID}
        medicationId={medicationId}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

function baseMedicationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    medicationId: MEDICATION_ID,
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

describe('MedicationFormDialog — SPEC FE12b §4 paso 10', () => {
  it('elegir del buscador deja el nombre en sólo lectura y envía medicationCode', async () => {
    const user = setupUser();
    mockEmptyCatalogs();
    mockWhodrugSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseMedicationRow() });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Medicamento'), 'par');
    await user.click(await screen.findByRole('option', { name: /Paracetamol/ }));

    const nameField = await screen.findByLabelText('Medicamento');
    expect(nameField).toHaveAttribute('readonly');
    expect(screen.getByText('Del catálogo de medicamentos.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ medicationName: 'Paracetamol', medicationCode: 'PAR001' });
  }, 60000);

  it('«quitar» devuelve el campo a texto libre y manda medicationCode: null', async () => {
    const user = setupUser();
    mockEmptyCatalogs();
    mockWhodrugSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseMedicationRow() });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Medicamento'), 'par');
    await user.click(await screen.findByRole('option', { name: /Paracetamol/ }));
    await screen.findByText('Del catálogo de medicamentos.');

    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(screen.queryByText('Del catálogo de medicamentos.')).not.toBeInTheDocument();
    const nameField = screen.getByLabelText('Medicamento');
    expect(nameField).not.toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ medicationName: 'Paracetamol', medicationCode: null });
  }, 60000);

  it('marcar «otra medicación» también limpia medicationCode a null', async () => {
    const user = setupUser();
    mockEmptyCatalogs();
    mockWhodrugSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseMedicationRow() });
      }),
    );

    renderDialog();

    await user.type(await screen.findByLabelText('Medicamento'), 'par');
    await user.click(await screen.findByRole('option', { name: /Paracetamol/ }));
    await screen.findByText('Del catálogo de medicamentos.');

    await user.click(screen.getByRole('switch', { name: 'Otro (no consta en la lista)' }));
    await user.type(screen.getByLabelText('Describa el medicamento'), 'Paracetamol de otra marca');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ medicationCode: null, isOtherMedication: true });
  }, 60000);

  it('con pharmaceuticalForm sin sembrar, el desplegable sale deshabilitado y la medicación se guarda igual', async () => {
    const user = setupUser();
    mockEmptyCatalogs();
    mockWhodrugSearch();
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseMedicationRow() });
      }),
    );

    renderDialog();

    expect(
      await screen.findByRole('combobox', { name: 'Forma farmacéutica' }),
    ).toBeDisabled();
    expect(screen.getAllByText('Este catálogo no tiene datos cargados todavía.')).toHaveLength(2);

    await user.type(screen.getByLabelText('Medicamento'), 'Paracetamol');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      medicationName: 'Paracetamol',
      pharmaceuticalFormItemId: null,
      administrationRouteItemId: null,
    });
  }, 60000);
});
