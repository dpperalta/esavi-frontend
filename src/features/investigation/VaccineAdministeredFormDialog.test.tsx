import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineAdministeredFormDialog } from './VaccineAdministeredFormDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();
const LONG_WAIT = { timeout: 30000 };

const INVESTIGATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VACCINE_WHODRUG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VACCINE_ADMINISTERED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { value: 'ECU' } }),
    ),
    // `<WhodrugTreePicker>` sondea siempre el primer nivel del árbol, incluso en modo edición con
    // `vaccineWhodrugId` ya resuelto (es el mismo sondeo que reutiliza `useWhodrugDictionaryAvailable`,
    // paso 3) — sin este valor por defecto, cualquier test que no lo sobrescriba se queda esperando
    // una petición sin responder. Los tests que necesitan un árbol concreto lo sobrescriben con `server.use`.
    http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, total: 0, options: [] } }),
    ),
  );
});

function treeResponse(
  options: Array<{ value: string | null; matchCount: number; vaccineWhodrugId: string | null }>,
) {
  return HttpResponse.json({
    ok: true,
    message: 'ok',
    data: { count: options.length, total: options.reduce((sum, o) => sum + o.matchCount, 0), options },
  });
}

function detailResponse(overrides: Record<string, unknown> = {}) {
  return HttpResponse.json({
    ok: true,
    message: 'ok',
    data: {
      vaccineWhodrugId: VACCINE_WHODRUG_ID,
      externalId: null,
      drugCode: 'CODE-1',
      drugRecNo: null,
      drugRecNoSeq: null,
      drugName: 'Vacuna resuelta',
      language: 'es',
      medicinalProductId: null,
      atcs: null,
      icd11: null,
      icd11Term: null,
      abbreviation: 'BCG',
      ingredient: null,
      ingredientTranslation: null,
      languageCode: null,
      iso3Code: null,
      countryMedicinalProductId: null,
      maHolders: null,
      maHoldersMedicinalProductId: null,
      form: null,
      formTranslations: null,
      formMedicinalProductId: null,
      strength: null,
      strengthMedicinalProductId: null,
      noDose: null,
      diluent: null,
      isGeneric: null,
      isPreferred: false,
      notes: null,
      metadata: null,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: null,
      deletedAt: null,
      ...overrides,
    },
  });
}

function vaccineAdministeredRow(overrides: Record<string, unknown> = {}) {
  return {
    vaccineAdministeredId: VACCINE_ADMINISTERED_ID,
    investigationId: INVESTIGATION_ID,
    sortOrder: 1,
    vaccineWhodrugId: VACCINE_WHODRUG_ID,
    doseNumber: 1,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    vaccineWhodrug: { vaccineWhodrugId: VACCINE_WHODRUG_ID, drugCode: 'CODE-1', drugName: 'Vacuna resuelta' },
    ...overrides,
  };
}

function renderDialog(vaccineAdministered: ReturnType<typeof vaccineAdministeredRow> | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VaccineAdministeredFormDialog
        open
        onOpenChange={() => {}}
        investigationId={INVESTIGATION_ID}
        vaccineAdministered={vaccineAdministered}
      />
    </QueryClientProvider>,
  );
}

describe('VaccineAdministeredFormDialog — SPEC FE13d §4 paso 6', () => {
  it(
    'elegir en el árbol resuelto rellena vaccineWhodrugId y el POST no lleva sortOrder',
    async () => {
      let requestBody: Record<string, unknown> | null = null;
      server.use(
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'BCG', matchCount: 1, vaccineWhodrugId: VACCINE_WHODRUG_ID }]),
        ),
        http.get(`http://localhost:4500/api/whodrug-vaccines/${VACCINE_WHODRUG_ID}`, () =>
          detailResponse({}),
        ),
        http.post('http://localhost:4500/api/investigation-vaccines-administered', async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: vaccineAdministeredRow({}) });
        }),
      );

      renderDialog(null);
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: /BCG/ }, LONG_WAIT));
      expect((await screen.findAllByText('Vacuna resuelta', {}, LONG_WAIT)).length).toBeGreaterThan(0);

      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(requestBody).not.toBeNull());
      expect(requestBody).toMatchObject({
        vaccineWhodrugId: VACCINE_WHODRUG_ID,
        investigationId: INVESTIGATION_ID,
      });
      expect((requestBody as Record<string, unknown> | null)?.sortOrder).toBeUndefined();
    },
    60000,
  );

  it('sin elegir ninguna vacuna, el submit no dispara ningún POST — es bloqueante', async () => {
    let posted = false;
    server.use(
      http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () => treeResponse([])),
      http.post('http://localhost:4500/api/investigation-vaccines-administered', () => {
        posted = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: vaccineAdministeredRow({}) });
      }),
    );

    renderDialog(null);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted).toBe(false);
  });

  it(
    '«Asignar sólo la abreviatura» avisa y no rellena ningún campo — no hay rama cruda',
    async () => {
      server.use(
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'BCG', matchCount: 3, vaccineWhodrugId: null }]),
        ),
      );

      renderDialog(null);
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: /BCG/ }, LONG_WAIT));
      await user.click(await screen.findByRole('button', { name: 'Asignar sólo la abreviatura' }));

      expect(toastError).toHaveBeenCalled();
      // Sigue en el árbol — no hay un campo vaccineName donde haya podido aterrizar la abreviatura.
      expect(screen.queryByDisplayValue('Vacuna resuelta')).not.toBeInTheDocument();
    },
    60000,
  );

  it(
    'un 409 INVVACAD_001_ALREADY_EXISTS marca el campo de la vacuna con el mensaje del backend',
    async () => {
      server.use(
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'BCG', matchCount: 1, vaccineWhodrugId: VACCINE_WHODRUG_ID }]),
        ),
        http.get(`http://localhost:4500/api/whodrug-vaccines/${VACCINE_WHODRUG_ID}`, () =>
          detailResponse({}),
        ),
        http.post('http://localhost:4500/api/investigation-vaccines-administered', () =>
          HttpResponse.json(
            {
              ok: false,
              message: 'Esa vacuna ya está en la lista. Si son dos dosis distintas, indica el número de dosis en cada una.',
              code: 'INVVACAD_001_ALREADY_EXISTS',
            },
            { status: 409 },
          ),
        ),
      );

      renderDialog(null);
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: /BCG/ }, LONG_WAIT));
      // `<WhodrugTreePicker>` collapses to its summary as soon as the option is clicked, but only
      // writes `vaccineWhodrugId` into the form once the detail read answers. Saving before that
      // submits a null id, fails the schema and never reaches the 409 this test is about.
      // The drug name only exists once that read answered.
      await waitFor(
        () => expect(screen.getAllByText('Vacuna resuelta').length).toBeGreaterThan(0),
        LONG_WAIT,
      );
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(
        await screen.findByText(
          'Esa vacuna ya está en la lista. Si son dos dosis distintas, indica el número de dosis en cada una.',
          {},
          LONG_WAIT,
        ),
      ).toBeInTheDocument();
      // El 409 se mapea a un campo — no debe caer en el toast genérico de error no mapeado.
      expect(toastError).not.toHaveBeenCalled();
    },
    60000,
  );

  it(
    'editar precarga vaccineWhodrugId, doseNumber y notes desde la fila que trajo el listado',
    async () => {
      server.use(
        http.get(`http://localhost:4500/api/whodrug-vaccines/${VACCINE_WHODRUG_ID}`, () =>
          detailResponse({}),
        ),
      );

      renderDialog(vaccineAdministeredRow({ doseNumber: 2, notes: 'Dosis de refuerzo' }));

      // El resumen resuelto repite el nombre — en el encabezado y en la fila "Nombre del
      // medicamento" — así que basta con que aparezca al menos una vez.
      expect((await screen.findAllByText('Vacuna resuelta', {}, LONG_WAIT)).length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue('2')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dosis de refuerzo')).toBeInTheDocument();
    },
    60000,
  );

  it(
    'editar guarda con PUT contra /:vaccineAdministeredId, sin sortOrder',
    async () => {
      let hitUrl: string | null = null;
      let requestBody: Record<string, unknown> | null = null;
      server.use(
        http.get(`http://localhost:4500/api/whodrug-vaccines/${VACCINE_WHODRUG_ID}`, () =>
          detailResponse({}),
        ),
        http.put(
          `http://localhost:4500/api/investigation-vaccines-administered/${VACCINE_ADMINISTERED_ID}`,
          async ({ request }) => {
            hitUrl = request.url;
            requestBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({ ok: true, message: 'ok', data: vaccineAdministeredRow({}) });
          },
        ),
      );

      renderDialog(vaccineAdministeredRow({ doseNumber: 2 }));
      const user = setupUser();

      await screen.findAllByText('Vacuna resuelta', {}, LONG_WAIT);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(hitUrl).not.toBeNull());
      expect(hitUrl).toContain(`/investigation-vaccines-administered/${VACCINE_ADMINISTERED_ID}`);
      expect((requestBody as Record<string, unknown> | null)?.sortOrder).toBeUndefined();
      expect((requestBody as Record<string, unknown> | null)?.investigationId).toBeUndefined();
    },
    60000,
  );
});
