import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TeamMemberList } from './TeamMemberList';

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
const MEMBER_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function memberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    investigationTeamMemberId: MEMBER_1,
    investigationId: INVESTIGATION_1,
    fullName: 'Ana Pérez',
    institutionName: 'MINSAL',
    email: 'ana.perez@example.com',
    phone: '0999999999',
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

function mockList(rows: ReturnType<typeof memberRow>[]) {
  server.use(
    http.get(
      `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

// Lista con estado propio: el alta invalida `['investigationTeamMember']` y provoca un refetch
// de verdad — un handler fijo devolvería siempre la misma foto y no probaría nada.
function mockStatefulList(initialRows: ReturnType<typeof memberRow>[]) {
  const rows = [...initialRows];
  server.use(
    http.get(
      `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
  return rows;
}

function renderList(disabled = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamMemberList investigationId={INVESTIGATION_1} disabled={disabled} />
    </QueryClientProvider>,
  );
}

describe('TeamMemberList — sección A2 del paso 5 (SPEC FE13a §4 paso 10)', () => {
  it('sin botón de borrar, ni con filas activas', async () => {
    mockList([memberRow()]);
    renderList();

    await screen.findAllByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('el alta invalida la lista, y la pantalla muestra el fullName devuelto en Title Case, no lo tecleado', async () => {
    const user = setupUser();
    const rows = mockStatefulList([]);
    server.use(
      http.post('http://localhost:4500/api/investigation-team-members', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ fullName: 'ANA PÉREZ', investigationId: INVESTIGATION_1 });
        // El backend normaliza a Title Case (SPEC FE13a §3.5 D) — la pantalla debe mostrar lo
        // devuelto, nunca lo escrito.
        const created = memberRow({ fullName: 'Ana Pérez' });
        rows.push(created);
        return HttpResponse.json({ ok: true, message: 'ok', data: created }, { status: 201 });
      }),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Nombres y apellidos'), 'ANA PÉREZ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Tras el alta, la lista se releyó (invalidación implícita en `createResource`) y muestra el
    // nombre devuelto, en Title Case — no "ANA PÉREZ".
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(await screen.findAllByText('Ana Pérez')).not.toHaveLength(0);
    expect(screen.queryByText('ANA PÉREZ')).not.toBeInTheDocument();
  }, 30000);

  it('un 409 de nombre duplicado deja el diálogo abierto con el error anclado en fullName', async () => {
    const user = setupUser();
    mockList([]);
    server.use(
      http.post('http://localhost:4500/api/investigation-team-members', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya hay un miembro con ese nombre.', code: 'INVTEAM_001_ALREADY_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Nombres y apellidos'), 'Juan Pérez');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya hay un miembro con ese nombre.')).toBeInTheDocument();
    // El diálogo se queda abierto — el campo sigue en pantalla, no vuelve a la lista.
    expect(screen.getByLabelText('Nombres y apellidos')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('la tarjeta móvil muestra nombre, institución y correo, y no el teléfono', async () => {
    mockList([memberRow()]);
    const { container } = renderList();

    await screen.findAllByText('Ana Pérez');
    const mobileCard = container.querySelector('.md\\:hidden');
    expect(mobileCard).not.toBeNull();
    expect(mobileCard!.textContent).toContain('Ana Pérez');
    expect(mobileCard!.textContent).toContain('MINSAL');
    expect(mobileCard!.textContent).toContain('ana.perez@example.com');
    expect(mobileCard!.textContent).not.toContain('0999999999');
  });
});
