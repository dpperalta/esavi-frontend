import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MedicalHistoryFormDialog } from './MedicalHistoryFormDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const CASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEDICAL_HISTORY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

function renderDialog(medicalHistoryId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicalHistoryFormDialog
        open
        caseId={CASE_ID}
        notificationId={NOTIFICATION_ID}
        medicalHistoryId={medicalHistoryId}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

function mockMeddraSearch() {
  server.use(
    http.get('http://localhost:4500/api/meddra/search', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: 1, rows: [{ code: 'DIAB01', name: 'Diabetes mellitus', termGroup: 'PT' }] },
      }),
    ),
  );
}

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    medicalHistoryId: MEDICAL_HISTORY_ID,
    notificationId: NOTIFICATION_ID,
    diagnosticTermId: null,
    historyRaw: 'Diabetes mellitus',
    sortOrder: 1,
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

// `ESAVI-MEDHIST-006` — el diálogo lee de aquí la fila que edita, nunca del `003` (SPEC FE12e §3.2).
function mockListByCase(rows: unknown[]) {
  server.use(
    http.get(`http://localhost:4500/api/notification-medical-histories/case/${CASE_ID}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function mockCreate(capture: { body: Record<string, unknown> | null }) {
  server.use(
    http.post('http://localhost:4500/api/notification-medical-histories', async ({ request }) => {
      capture.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true, message: 'ok', data: baseRow() }, { status: 201 });
    }),
  );
}

describe('MedicalHistoryFormDialog — SPEC FE12e §4 paso 10', () => {
  it('elegir un término del buscador envía source: MEDDRA', async () => {
    const user = setupUser();
    mockMeddraSearch();
    const capture: { body: Record<string, unknown> | null } = { body: null };
    mockCreate(capture);

    renderDialog();

    await user.type(await screen.findByLabelText('Antecedente médico'), 'Dia');
    await user.click(await screen.findByRole('option', { name: /Diabetes mellitus/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(capture.body).not.toBeNull());
    expect(capture.body).toMatchObject({
      historyName: 'Diabetes mellitus',
      historyCode: 'DIAB01',
      source: 'MEDDRA',
      notificationId: NOTIFICATION_ID,
    });
  }, 60000);

  it('escrito a mano con código envía source: LOCAL, que es lo que acuña el término', async () => {
    const user = setupUser();
    mockMeddraSearch();
    const capture: { body: Record<string, unknown> | null } = { body: null };
    mockCreate(capture);

    renderDialog();

    fireEvent.change(await screen.findByLabelText('Antecedente médico'), {
      target: { value: 'Hipertensión no catalogada' },
    });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'HTA-X' } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(capture.body).not.toBeNull());
    expect(capture.body).toMatchObject({
      historyName: 'Hipertensión no catalogada',
      historyCode: 'HTA-X',
      source: 'LOCAL',
    });
  }, 60000);

  it('sin código, source no viaja en el cuerpo y el antecedente queda como texto libre', async () => {
    const user = setupUser();
    mockMeddraSearch();
    const capture: { body: Record<string, unknown> | null } = { body: null };
    mockCreate(capture);

    renderDialog();

    fireEvent.change(await screen.findByLabelText('Antecedente médico'), {
      target: { value: 'Asma' },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(capture.body).not.toBeNull());
    expect(capture.body).toMatchObject({ historyName: 'Asma', historyCode: null });
    expect(capture.body).not.toHaveProperty('source');
  }, 60000);

  it('al reeditar, el campo muestra historyRaw y guardar sin tocarlo no envía historyName', async () => {
    const user = setupUser();
    mockMeddraSearch();
    mockListByCase([
      baseRow({
        historyRaw: 'Diabetes que escribió el notificador',
        diagnosticTermId: 'term-1',
        diagnosticTerm: {
          diagnosticTermId: 'term-1',
          source: 'MEDDRA',
          code: 'DIAB01',
          name: 'Diabetes mellitus',
          termGroup: 'PT',
          isActive: true,
        },
      }),
    ]);
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/notification-medical-histories/${MEDICAL_HISTORY_ID}`,
        async ({ request }) => {
          putBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: baseRow() });
        },
      ),
    );

    renderDialog(MEDICAL_HISTORY_ID);

    // El nombre efectivo es `historyRaw`, no el del maestro: es lo que escribió el notificador
    // (SPEC FE12e §3.3).
    expect(await screen.findByLabelText('Antecedente médico')).toHaveValue(
      'Diabetes que escribió el notificador',
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(putBody).not.toBeNull());
    // Reenviarlo sin tocarlo reescribiría ese texto con el eco del `GET` (§3.3, §3.5).
    expect(putBody).not.toHaveProperty('historyName');
  }, 60000);

  it('cambiar el nombre al reeditar sí lo envía', async () => {
    const user = setupUser();
    mockMeddraSearch();
    mockListByCase([baseRow({ historyRaw: 'Asma' })]);
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/notification-medical-histories/${MEDICAL_HISTORY_ID}`,
        async ({ request }) => {
          putBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: baseRow() });
        },
      ),
    );

    renderDialog(MEDICAL_HISTORY_ID);

    const field = await screen.findByLabelText('Antecedente médico');
    // El valor se fija de una vez: lo que prueba este caso es el cuerpo del `PUT`, no el tecleo,
    // y `user.clear()` sobre el buscador con valor previo se queda colgado.
    fireEvent.change(field, { target: { value: 'Asma bronquial' } });
    await waitFor(() => expect(field).toHaveValue('Asma bronquial'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toMatchObject({ historyName: 'Asma bronquial' });
  }, 60000);

  it('el 404 del término ofrece guardarlo como texto libre, sin toast', async () => {
    const user = setupUser();
    mockMeddraSearch();
    let calls = 0;
    let lastBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-medical-histories', async ({ request }) => {
        calls++;
        lastBody = (await request.json()) as Record<string, unknown>;
        if (calls === 1) {
          return HttpResponse.json(
            {
              ok: false,
              message: 'término no encontrado',
              code: 'MEDHIST_001_DIAGTERM_NOT_FOUND',
            },
            { status: 404 },
          );
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: baseRow() }, { status: 201 });
      }),
    );

    renderDialog();

    fireEvent.change(await screen.findByLabelText('Antecedente médico'), {
      target: { value: 'Hipertensión' },
    });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'HTA-X' } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await user.click(await screen.findByRole('button', { name: 'Guardar como texto libre' }));

    await waitFor(() => expect(calls).toBe(2));
    expect(lastBody).toMatchObject({ historyName: 'Hipertensión', historyCode: null });
    expect(lastBody).not.toHaveProperty('source');
    // No es un error del usuario: lo explica el campo, no un toast (§3.5).
    expect(toastError).not.toHaveBeenCalled();
  }, 60000);
});
