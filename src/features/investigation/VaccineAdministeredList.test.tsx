import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { VaccineAdministeredList } from './VaccineAdministeredList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const INVESTIGATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VACCINE_ADMINISTERED_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VACCINE_WHODRUG_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
    http.get('http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { value: 'ECU' } }),
    ),
  );
});

function mockDictionary(total: number) {
  server.use(
    http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { count: total === 0 ? 0 : 1, total, options: total === 0 ? [] : [{ value: 'BCG', matchCount: total, vaccineWhodrugId: null }] },
      }),
    ),
  );
}

function vaccineAdministeredRow(overrides: Record<string, unknown> = {}) {
  return {
    vaccineAdministeredId: VACCINE_ADMINISTERED_1,
    investigationId: INVESTIGATION_1,
    sortOrder: 1,
    vaccineWhodrugId: VACCINE_WHODRUG_1,
    doseNumber: 1,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    vaccineWhodrug: { vaccineWhodrugId: VACCINE_WHODRUG_1, drugCode: 'CODE-1', drugName: 'BCG vaccine' },
    ...overrides,
  };
}

function mockList(rows: ReturnType<typeof vaccineAdministeredRow>[]) {
  server.use(
    http.get(
      `http://localhost:4500/api/investigation-vaccines-administered/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function renderList(disabled = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VaccineAdministeredList investigationId={INVESTIGATION_1} disabled={disabled} />
    </QueryClientProvider>,
  );
}

describe('VaccineAdministeredList — SPEC FE13d §4 paso 7', () => {
  it('con el diccionario en total:0 no se pinta «Añadir» y sí el motivo', async () => {
    mockDictionary(0);
    mockList([]);

    renderList();

    expect(
      await screen.findByText(
        'El diccionario WHODrug no está importado en este despliegue. Esta sección sólo admite vacunas codificadas y no puede rellenarse hasta que un administrador lo importe.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Añadir vacuna' }),
    ).not.toBeInTheDocument();
    // El motivo reemplaza al vacío genérico — no salen los dos textos a la vez.
    expect(
      screen.queryByText('Aún no se ha añadido ninguna vacuna administrada.'),
    ).not.toBeInTheDocument();
  });

  it('con el diccionario disponible y la lista vacía, se pinta el vacío normal con «Añadir»', async () => {
    mockDictionary(5);
    mockList([]);

    renderList();

    expect(
      await screen.findByText('Aún no se ha añadido ninguna vacuna administrada.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Añadir vacuna' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'El diccionario WHODrug no está importado en este despliegue. Esta sección sólo admite vacunas codificadas y no puede rellenarse hasta que un administrador lo importe.',
      ),
    ).not.toBeInTheDocument();
  });

  it('con filas, se pintan la vacuna, la dosis y las notas', async () => {
    mockDictionary(5);
    mockList([vaccineAdministeredRow({ doseNumber: 2, notes: 'Refuerzo' })]);

    renderList();

    await waitFor(() => expect(screen.getAllByText('BCG vaccine').length).toBeGreaterThan(0));
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Refuerzo').length).toBeGreaterThan(0);
  });

  it('dar de baja pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    const user = setupUser();
    mockDictionary(5);
    mockList([vaccineAdministeredRow()]);
    let deleteCalls = 0;
    server.use(
      http.delete(
        `http://localhost:4500/api/investigation-vaccines-administered/${VACCINE_ADMINISTERED_1}`,
        () => {
          deleteCalls++;
          return HttpResponse.json({ ok: true, message: 'ok', data: null });
        },
      ),
    );

    renderList();

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar BCG vaccine' });
    await user.click(deleteButton);

    expect(
      await screen.findByText('¿Dar de baja «BCG vaccine»? Esta acción no se puede deshacer desde aquí.'),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it('disabled:true no pinta «Añadir» ni los botones de editar o eliminar de ninguna fila', async () => {
    mockDictionary(5);
    mockList([vaccineAdministeredRow({})]);

    renderList(true);

    await waitFor(() => expect(screen.getAllByText('BCG vaccine').length).toBeGreaterThan(0));
    expect(
      screen.queryByRole('button', { name: 'Añadir vacuna' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });
});
