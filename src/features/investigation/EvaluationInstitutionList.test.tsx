import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { EvaluationInstitutionList } from './EvaluationInstitutionList';

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
const INSTITUTION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CATALOG_TYPE_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CATALOG_ITEM_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
    // `createResource` decides 002A/002B by role level, and `HealthFacilitySelect` reads the
    // current user too even with `scoped={false}` (SPEC FE13c §4 paso 6).
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
    // The seed of §7 riesgo A — five establishment types, not "la misma"/"diferente" — arrives
    // here exactly as `ESAVI-CATITEM-002A` would answer it. Nothing in the screen compares
    // against `code`.
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [{ catalogTypeId: CATALOG_TYPE_1, code: 'evaluationInstitutionType', name: 'Tipo de institución evaluadora' }],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${CATALOG_TYPE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [{ catalogItemId: CATALOG_ITEM_1, code: 'HOSPITAL', name: 'Hospital', value: null, sortOrder: 1 }],
        },
      }),
    ),
  );
});

function institutionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evaluationInstitutionId: INSTITUTION_1,
    investigationId: INVESTIGATION_1,
    sortOrder: 1,
    healthFacilityId: null,
    institutionName: 'Clínica del Valle',
    personName: null,
    personContact: '0999999999',
    evaluationInstitutionTypeItemId: null,
    notes: null,
    isActive: true,
    healthFacility: null,
    institutionType: { catalogItemId: CATALOG_ITEM_1, code: 'HOSPITAL', name: 'Hospital' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function mockList(rows: ReturnType<typeof institutionRow>[]) {
  server.use(
    http.get(
      `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

// List with its own state: creation invalidates `['evaluationInstitution']` and triggers a real
// refetch — a fixed handler would always return the same snapshot and prove nothing (SPEC FE13c
// §4 paso 6, same pattern as `TeamMemberList.test.tsx`).
function mockStatefulList(initialRows: ReturnType<typeof institutionRow>[]) {
  const rows = [...initialRows];
  server.use(
    http.get(
      `http://localhost:4500/api/evaluation-institutions/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
  return rows;
}

function renderList(disabled = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EvaluationInstitutionList investigationId={INVESTIGATION_1} disabled={disabled} />
    </QueryClientProvider>,
  );
}

describe('EvaluationInstitutionList — C.7 (SPEC FE13c §4 paso 6)', () => {
  it('dar de baja pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    const user = setupUser();
    mockList([institutionRow()]);
    let deleteCalls = 0;
    server.use(
      http.delete(`http://localhost:4500/api/evaluation-institutions/${INSTITUTION_1}`, () => {
        deleteCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );
    renderList();

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Clínica del Valle' });
    await user.click(deleteButton);

    expect(
      await screen.findByText('¿Dar de baja «Clínica del Valle»? Esta acción no se puede deshacer desde aquí.'),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it('con disabled, no hay botón de borrar', async () => {
    mockList([institutionRow()]);
    renderList(true);

    await screen.findAllByText('Clínica del Valle');
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('el alta invalida la lista', async () => {
    const user = setupUser();
    const rows = mockStatefulList([]);
    server.use(
      http.post('http://localhost:4500/api/evaluation-institutions', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ investigationId: INVESTIGATION_1, institutionName: 'Clínica Norte' });
        const created = institutionRow({ evaluationInstitutionId: 'new-row', institutionName: 'Clínica Norte' });
        rows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
    await user.type(
      await screen.findByLabelText('Nombre de la institución (si no está en el buscador)'),
      'Clínica Norte',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(await screen.findAllByText('Clínica Norte')).not.toHaveLength(0);
  }, 30000);

  it('un 409 de unidad de salud duplicada deja el diálogo abierto con el error anclado en el buscador', async () => {
    const user = setupUser();
    mockList([]);
    server.use(
      http.post('http://localhost:4500/api/evaluation-institutions', () =>
        HttpResponse.json(
          { ok: false, message: 'Esta unidad de salud ya está en la lista.', code: 'EVALINST_001_ALREADY_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
    await user.type(
      await screen.findByLabelText('Nombre de la institución (si no está en el buscador)'),
      'Clínica Norte',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Esta unidad de salud ya está en la lista.')).toBeInTheDocument();
    // The dialog stays open — the field remains on screen, it doesn't go back to the list.
    // `<HealthFacilitySelect>` carries its own fixed accessible name (SPEC FE10 §1C), independent
    // of the visual `<FormLabel>` this dialog puts above it.
    expect(screen.getByLabelText('Unidad de salud')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('dos filas con el mismo nombre libre y sin unidad de salud se aceptan las dos', async () => {
    const user = setupUser();
    const rows = mockStatefulList([]);
    server.use(
      http.post('http://localhost:4500/api/evaluation-institutions', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const created = institutionRow({
          evaluationInstitutionId: `row-${rows.length + 1}`,
          institutionName: body.institutionName as string,
        });
        rows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    renderList();

    for (let i = 0; i < 2; i++) {
      await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
      await user.type(
        await screen.findByLabelText('Nombre de la institución (si no está en el buscador)'),
        'Puesto de salud comunitario',
      );
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(i + 1));
    }

    expect(rows).toHaveLength(2);
    // Both the desktop table and the mobile card render every row at once in jsdom (there's no
    // real viewport to hide either), so each accepted row's name appears twice in the DOM.
    expect(await screen.findAllByText('Puesto de salud comunitario')).toHaveLength(4);
  }, 30000);

  it('el selector de tipo pinta lo que devuelve el catálogo, sin comparar contra ningún literal', async () => {
    const user = setupUser();
    mockList([]);
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir institución' }));
    await user.click(
      await screen.findByRole('combobox', {
        name: '¿La institución en la que fue atendido por primera vez es diferente a la institución en donde recibió el tratamiento definitivo?',
      }),
    );

    expect(await screen.findByRole('option', { name: 'Hospital' })).toBeInTheDocument();
  });

  it('la tarjeta móvil muestra nombre, tipo y contacto, y no el nombre de la persona ni las notas', async () => {
    mockList([institutionRow({ personName: 'Julio Bustos', notes: 'Observación interna' })]);
    const { container } = renderList();

    await screen.findAllByText('Clínica del Valle');
    const mobileCard = container.querySelector('.md\\:hidden');
    expect(mobileCard).not.toBeNull();
    expect(mobileCard!.textContent).toContain('Clínica del Valle');
    expect(mobileCard!.textContent).toContain('Hospital');
    expect(mobileCard!.textContent).toContain('0999999999');
    expect(mobileCard!.textContent).not.toContain('Julio Bustos');
    expect(mobileCard!.textContent).not.toContain('Observación interna');
  });
});
