import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { NotifierList } from './NotifierList';

const server = setupServer();

const CASE_1 = '88888888-8888-4888-8888-888888888888';
const NOTIFIER_1 = '99999999-9999-4999-8999-999999999999';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'u1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

// The list shape as ESAVI-NOTIFIER-002A actually returns it (SPEC FE10 §3.3): `case` is a
// resolved object, and there's no `caseId` at the first level for a component to misread.
function makeListRow(overrides: Record<string, unknown> = {}) {
  return {
    notifierId: NOTIFIER_1,
    firstName: 'Juan',
    lastName: 'Gómez',
    email: null,
    phoneNumber: null,
    room: null,
    address: null,
    isActive: true,
    case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01' },
    profession: { catalogItemId: 'prof-1', code: 'DOCTOR', name: 'Médico' },
    geoLocation: null,
    ...overrides,
  };
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    notifierId: NOTIFIER_1,
    firstName: 'Juan',
    lastName: 'Gómez',
    email: null,
    phoneNumber: null,
    room: null,
    address: null,
    details: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01' },
    // `null`, not a fabricated id: professionItemId/geoLocationId are validated as real UUIDs by
    // the form schema, and a non-UUID default would fail client-side validation before the PUT
    // this test asserts on ever fires.
    profession: null,
    geoLocation: null,
    ...overrides,
  };
}

function mockList(rows: unknown[]) {
  server.use(
    http.get('http://localhost:4500/api/notifiers', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } }),
    ),
  );
}

function mockCatalogTypesEmpty() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockGeoLocationPickerEmpty() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotifierList caseId={CASE_1} />
    </QueryClientProvider>,
  );
}

describe('NotifierList — «Quitar» exige ADMIN (SPEC FE10 §7 riesgo, §4 paso 10)', () => {
  it('con USER, «Editar» se pinta y «Quitar» no', async () => {
    signInAs('USER', 25);
    mockList([makeListRow()]);

    renderList();

    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
  });

  it('con ADMIN, «Quitar» también se pinta', async () => {
    signInAs('ADMIN', 50);
    mockList([makeListRow()]);

    renderList();

    expect(await screen.findByRole('button', { name: 'Quitar' })).toBeInTheDocument();
  });
});

describe('NotifierList — el PUT de edición no envía caseId (SPEC FE10 §3.5)', () => {
  it('el body del PUT no tiene la clave caseId', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockList([makeListRow()]);
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    server.use(
      http.get(`http://localhost:4500/api/notifiers/${NOTIFIER_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeDetail() }),
      ),
    );

    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/notifiers/${NOTIFIER_1}`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: makeDetail() });
      }),
    );

    renderList();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByLabelText('Nombres');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).not.toHaveProperty('caseId');
  });
});
