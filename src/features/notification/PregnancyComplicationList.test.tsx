import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { PregnancyComplicationList } from './PregnancyComplicationList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const PREGNANCY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPLICATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPLICATION_TYPE_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

function renderList(pregnancyId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PregnancyComplicationList pregnancyId={pregnancyId} />
    </QueryClientProvider>,
  );
}

function complicationRow(overrides: Partial<Record<string, unknown>>) {
  return {
    complicationId: COMPLICATION_1,
    pregnancyId: PREGNANCY_ID,
    diagnosticTermId: null,
    complicationTypeItemId: COMPLICATION_TYPE_1,
    complicationRawName: 'Preeclampsia',
    sortOrder: 1,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    diagnosticTerm: null,
    complicationType: { catalogItemId: COMPLICATION_TYPE_1, code: 'HYPERTENSIVE', name: 'Hipertensiva', isActive: true },
    ...overrides,
  };
}

function mockEmptyComplicationTypeCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

const COMPLICATION_TYPE_CATALOG_TYPE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// `complicationTypeItemId` es obligatorio en el schema (§3.5) — sin al menos un ítem sembrado el
// «Guardar» del modal nunca llega a validar, así que el test que sí espera un `POST` necesita el
// catálogo con contenido, no vacío como el resto de esta suite.
function mockComplicationTypeCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogTypeId: COMPLICATION_TYPE_CATALOG_TYPE,
              code: 'pregnancyComplicationType',
              name: 'Tipo de complicación',
              description: null,
              sortOrder: 0,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${COMPLICATION_TYPE_CATALOG_TYPE}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              catalogItemId: COMPLICATION_TYPE_1,
              catalogTypeId: COMPLICATION_TYPE_CATALOG_TYPE,
              code: 'HYPERTENSIVE',
              name: 'Hipertensiva',
              value: 'HYPERTENSIVE',
              sortOrder: 0,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
  );
}

describe('PregnancyComplicationList — SPEC FE12d §4 paso 9', () => {
  it('sin pregnancyId, la sección se muestra deshabilitada con su explicación, sin pedir la lista', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PregnancyComplicationList pregnancyId={null} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Guarda el bloque de embarazo antes de añadir complicaciones.')).toBeInTheDocument();
  });

  it('crear una complicación envía complicationName, complicationTypeItemId y pregnancyId', async () => {
    const user = setupUser();
    mockComplicationTypeCatalog();
    server.use(
      http.get(
        `http://localhost:4500/api/notification-pregnancy-complications/pregnancy/${PREGNANCY_ID}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get('http://localhost:4500/api/meddra/search', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/notification-pregnancy-complications', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: complicationRow({}) });
      }),
    );

    renderList(PREGNANCY_ID);

    await user.click(await screen.findByRole('button', { name: 'Añadir' }));
    await user.type(await screen.findByLabelText('Complicación'), 'Preeclampsia');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('combobox', { name: 'Tipo de complicación' }));
    await user.click(await screen.findByRole('option', { name: 'Hipertensiva' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      complicationName: 'Preeclampsia',
      complicationTypeItemId: COMPLICATION_TYPE_1,
      pregnancyId: PREGNANCY_ID,
    });
  }, 60000);

  it('dar de baja pide confirmación nombrando la fila y llama al DELETE sólo tras confirmar', async () => {
    const user = setupUser();
    mockEmptyComplicationTypeCatalog();
    server.use(
      http.get(
        `http://localhost:4500/api/notification-pregnancy-complications/pregnancy/${PREGNANCY_ID}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [complicationRow({})] } }),
      ),
    );
    let deleteCalls = 0;
    server.use(
      http.delete(`http://localhost:4500/api/notification-pregnancy-complications/${COMPLICATION_1}`, () => {
        deleteCalls++;
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    renderList(PREGNANCY_ID);

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Preeclampsia' });
    await user.click(deleteButton);

    expect(
      await screen.findByText('¿Eliminar la complicación «Preeclampsia»? Esta acción no se puede deshacer desde aquí.'),
    ).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  // SPEC FE12d §10.4: PREGCOMP-005A es la única escritura ADMIN de todo este spec — el 403 lleva
  // su propio mensaje, no el genérico de `notification.satellites`.
  it('un 403 AUTH_ROLE_FORBIDDEN al confirmar la baja muestra el aviso propio de administrador', async () => {
    const user = setupUser();
    mockEmptyComplicationTypeCatalog();
    server.use(
      http.get(
        `http://localhost:4500/api/notification-pregnancy-complications/pregnancy/${PREGNANCY_ID}`,
        () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [complicationRow({})] } }),
      ),
      http.delete(`http://localhost:4500/api/notification-pregnancy-complications/${COMPLICATION_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Rol insuficiente', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    renderList(PREGNANCY_ID);

    const [deleteButton] = await screen.findAllByRole('button', { name: 'Eliminar Preeclampsia' });
    await user.click(deleteButton);
    const [confirmButton] = await screen.findAllByRole('button', { name: 'Dar de baja' });
    await user.click(confirmButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith('Retirar una complicación exige un administrador en este despliegue.');
  });
});
