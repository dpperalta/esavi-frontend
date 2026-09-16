import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { NewbornConditionList } from './NewbornConditionList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const INVESTIGATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONDITION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  // No blocking catalog in B2 (§3.5 B, no hay `<CatalogSelect>` de tipo) — vacío por defecto.
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/meddra/search', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    // `createResource` picks 002A/002B by role level (`useCan`) — every list read needs this.
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
  );
});

function renderList(props: Partial<Parameters<typeof NewbornConditionList>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewbornConditionList investigationId={INVESTIGATION_1} {...props} />
    </QueryClientProvider>,
  );
}

function conditionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pregnancyConditionId: CONDITION_1,
    investigationId: INVESTIGATION_1,
    medicalHistory: {
      investigationId: INVESTIGATION_1,
      deletedAt: null,
      investigation: { investigationId: INVESTIGATION_1, isActive: true },
    },
    diagnosticTermId: null,
    diagnosticTerm: null,
    conditionRaw: 'Ictericia neonatal',
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

describe('NewbornConditionList — sección B2 (SPEC FE13b §4 paso 7)', () => {
  it('vacía: muestra el texto propio, no el silencio genérico de las demás listas satélite', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    renderList();

    expect(
      await screen.findByText('No se han registrado afecciones médicas del recién nacido.'),
    ).toBeInTheDocument();
  });

  it('dar de baja pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [conditionRow()] } }),
      ),
    );
    let deleteCalls = 0;
    server.use(
      http.delete(`http://localhost:4500/api/investigation-pregnancy-conditions/${CONDITION_1}`, () => {
        deleteCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );
    const user = setupUser();
    renderList();

    const [deleteButton] = await screen.findAllByRole('button', {
      name: 'Eliminar Ictericia neonatal',
    });
    await user.click(deleteButton);

    expect(
      await screen.findByText(
        '¿Dar de baja «Ictericia neonatal»? Esta acción no se puede deshacer desde aquí.',
      ),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it('con disabled, no hay botón de borrar', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [conditionRow()] } }),
      ),
    );
    renderList({ disabled: true });

    await screen.findAllByText('Ictericia neonatal');
    expect(
      screen.queryByRole('button', { name: 'Eliminar Ictericia neonatal' }),
    ).not.toBeInTheDocument();
  });

  it('crear una condición envía conditionName e investigationId', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-pregnancy-conditions', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: conditionRow({}) });
      }),
    );
    const user = setupUser();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir afección' }));
    // `fireEvent.change` en vez de `user.type` (SPEC FE13b §4 paso 7): este entorno tiene un
    // stall documentado de `userEvent` de hasta ~22s por evento (`src/test/user.ts`) que un
    // tecleo de veinte caracteres multiplica — el campo no necesita eventos de tecla reales para
    // que su `onChange` dispare la búsqueda debounced.
    fireEvent.change(
      await screen.findByLabelText('Describa la afección médica del recién nacido'),
      { target: { value: 'Ictericia neonatal' } },
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      conditionName: 'Ictericia neonatal',
      investigationId: INVESTIGATION_1,
    });
  }, 60000);

  it('un 409 ALREADY_EXISTS ancla en el término, con el mensaje del backend', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/investigation-pregnancy-conditions', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya está entre las condiciones activas.', code: 'INVPREG_001_ALREADY_EXISTS' },
          { status: 409 },
        ),
      ),
    );
    const user = setupUser();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir afección' }));
    // `fireEvent.change` en vez de `user.type` (SPEC FE13b §4 paso 7): este entorno tiene un
    // stall documentado de `userEvent` de hasta ~22s por evento (`src/test/user.ts`) que un
    // tecleo de veinte caracteres multiplica — el campo no necesita eventos de tecla reales para
    // que su `onChange` dispare la búsqueda debounced.
    fireEvent.change(
      await screen.findByLabelText('Describa la afección médica del recién nacido'),
      { target: { value: 'Ictericia neonatal' } },
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya está entre las condiciones activas.')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('el 404 de la nieta reemplaza la lista por «Falta la ficha», y «Crear la ficha» reabre', async () => {
    server.use(
      http.get(
        `http://localhost:4500/api/investigation-pregnancy-conditions/investigation/${INVESTIGATION_1}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/investigation-pregnancy-conditions', () =>
        HttpResponse.json(
          { ok: false, message: 'Falta la ficha', code: 'INVPREG_001_MEDICAL_HISTORY_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    let openPostCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-medical-histories', () => {
        openPostCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: { investigationId: INVESTIGATION_1 } });
      }),
    );
    const user = setupUser();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir afección' }));
    // `fireEvent.change` en vez de `user.type` (SPEC FE13b §4 paso 7): este entorno tiene un
    // stall documentado de `userEvent` de hasta ~22s por evento (`src/test/user.ts`) que un
    // tecleo de veinte caracteres multiplica — el campo no necesita eventos de tecla reales para
    // que su `onChange` dispare la búsqueda debounced.
    fireEvent.change(
      await screen.findByLabelText('Describa la afección médica del recién nacido'),
      { target: { value: 'Ictericia neonatal' } },
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Falta la ficha de antecedentes.')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Crear la ficha' }));
    await waitFor(() => expect(openPostCount).toBe(1));
    expect(screen.queryByText('Falta la ficha de antecedentes.')).not.toBeInTheDocument();
  }, 60000);
});
