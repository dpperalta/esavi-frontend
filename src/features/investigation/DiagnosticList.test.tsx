import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { DiagnosticList } from './DiagnosticList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const CASE_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVESTIGATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DIAGNOSTIC_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CATALOG_TYPE_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CATALOG_ITEM_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [{ catalogTypeId: CATALOG_TYPE_1, code: 'diagnosticType', name: 'Tipo de diagnóstico' }],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${CATALOG_TYPE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [{ catalogItemId: CATALOG_ITEM_1, code: 'PRESUMPTIVE', name: 'Presuntivo', value: null, sortOrder: 1 }],
        },
      }),
    ),
  );
});

// None of these tests assert on a picked MedDRA suggestion — only on what the term field submits
// — so `meddra/search` is left unmocked everywhere on purpose (same precedent as
// `EventFormDialog.test.tsx`'s edit-mode tests): the debounced query still fires and resolves
// (fast, as a rejected request) without a real round trip through the mock.

function diagnosticRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    diagnosticId: DIAGNOSTIC_1,
    investigationId: INVESTIGATION_1,
    diagnosticTermId: null,
    diagnosticTerm: { diagnosticTermId: 'term-1', source: 'MEDDRA', code: 'FIEBRE01', name: 'Fiebre alta', termGroup: 'PT', isActive: true },
    diagnosticRaw: null,
    diagnosticDate: '2026-01-05',
    diagnosticTypeItemId: null,
    diagnosticType: null,
    sortOrder: 1,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function mockList(rows: ReturnType<typeof diagnosticRow>[]) {
  server.use(
    http.get(`http://localhost:4500/api/investigation-diagnostics/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function renderList(disabled = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiagnosticList
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        disabled={disabled}
        onMissingInvestigation={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('DiagnosticList — C.17 (SPEC FE13c §4 paso 7)', () => {
  it('sin botón de borrar, ni con filas activas', async () => {
    mockList([diagnosticRow()]);
    renderList();

    await screen.findAllByText('Fiebre alta');
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('la lista pinta diagnosticRaw cuando existe, y el nombre del término cuando no', async () => {
    mockList([diagnosticRow({ diagnosticRaw: 'Fiebre alta persistente' })]);
    renderList();

    await screen.findAllByText('Fiebre alta persistente');
    expect(screen.queryAllByText('Fiebre alta')).toHaveLength(0);
  });

  it('editar sin tocar el término no envía diagnosticName; cambiar el texto sí', async () => {
    const user = setupUser();
    mockList([diagnosticRow()]);
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigation-diagnostics/${DIAGNOSTIC_1}`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: diagnosticRow() });
      }),
    );

    renderList();

    await screen.findAllByText('Fiebre alta');
    const editButtons = await screen.findAllByRole('button', { name: /Editar/ });
    await user.click(editButtons[0]);
    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).not.toHaveProperty('diagnosticName');
  }, 30000);

  it('cambiar el texto del término sí envía diagnosticName', async () => {
    const user = setupUser();
    mockList([diagnosticRow()]);
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigation-diagnostics/${DIAGNOSTIC_1}`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: diagnosticRow() });
      }),
    );

    renderList();

    const editButtons = await screen.findAllByRole('button', { name: /Editar/ });
    await user.click(editButtons[0]);
    const nameField = await screen.findByLabelText('Diagnóstico final o presuntivo');
    await user.type(nameField, ' persistente');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ diagnosticName: 'Fiebre alta persistente' });
  }, 30000);

  it('un 409 de diagnóstico duplicado deja el diálogo abierto con el error anclado en el término', async () => {
    const user = setupUser();
    mockList([]);
    server.use(
      http.post('http://localhost:4500/api/investigation-diagnostics', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Este diagnóstico ya está en la lista. Para confirmarlo, edita el diagnóstico existente.',
            code: 'INVDIAG_001_ALREADY_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir diagnóstico' }));
    await user.type(await screen.findByLabelText('Diagnóstico final o presuntivo'), 'Fiebre');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Este diagnóstico ya está en la lista. Para confirmarlo, edita el diagnóstico existente.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Diagnóstico final o presuntivo')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  }, 30000);

  it('el desplegable de tipo abre sin valor marcado', async () => {
    const user = setupUser();
    mockList([]);
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir diagnóstico' }));
    const combobox = await screen.findByRole('combobox', { name: 'Tipo de diagnóstico' });
    expect(combobox).toHaveTextContent('');
  });

  it('una fecha anterior al inicio de la investigación se acepta', async () => {
    const user = setupUser();
    mockList([]);
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-diagnostics', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: diagnosticRow() }, { status: 201 });
      }),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir diagnóstico' }));
    await user.type(await screen.findByLabelText('Diagnóstico final o presuntivo'), 'Fiebre');
    await user.keyboard('{Escape}');
    // A date far in the past — nothing in the client compares it against any of the
    // investigation's own dates (§3.5 C).
    await user.type(screen.getByLabelText('Fecha del diagnóstico'), '2000-01-01');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(requestBody).toMatchObject({ diagnosticDate: '2000-01-01' });
  }, 30000);
});
