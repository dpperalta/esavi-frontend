import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineFormDialog } from './VaccineFormDialog';

const server = setupServer();
const LONG_WAIT = { timeout: 30000 };

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CASE_ID = 'case-1';

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
  server.use(
    http.get('http://localhost:4500/api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { value: 'ECU' } }),
    ),
  );
});

function treeResponse(options: Array<{ value: string | null; matchCount: number; vaccineWhodrugId: string | null }>) {
  return HttpResponse.json({
    ok: true,
    message: 'ok',
    data: { count: options.length, total: options.reduce((sum, o) => sum + o.matchCount, 0), options },
  });
}

function detailResponse(overrides: Record<string, unknown>) {
  return HttpResponse.json({
    ok: true,
    message: 'ok',
    data: {
      vaccineWhodrugId: 'vw-1',
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
      abbreviation: 'HPV',
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

function vaccineRow(overrides: Record<string, unknown> = {}) {
  return {
    vaccineId: 'v-1',
    notificationId: NOTIFICATION_ID,
    vaccineWhodrugId: null,
    sortOrder: 1,
    isSuspected: false,
    whoCode: null,
    vaccineCode: null,
    vaccineName: 'BCG',
    vaccinationDate: '2026-03-10',
    vaccinationTime: null,
    doseNumber: 1,
    batchNumber: null,
    expirationDate: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    vaccineWhodrug: null,
    ...overrides,
  };
}

function renderDialog(vaccineId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VaccineFormDialog
        open
        caseId={CASE_ID}
        notificationId={NOTIFICATION_ID}
        eventDate={null}
        vaccineId={vaccineId}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('VaccineFormDialog — SPEC FE12c §4 paso 8', () => {
  it('editar abre sobre la fila de la caché de la lista, sin pedir su propio detalle (003)', async () => {
    let detailRequests = 0;
    server.use(
      http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [vaccineRow({ vaccineName: 'Pentavalente' })] } }),
      ),
      http.get('http://localhost:4500/api/notification-vaccines/v-1', () => {
        detailRequests++;
        return HttpResponse.json({ ok: true, message: 'ok', data: vaccineRow({}) });
      }),
    );

    renderDialog('v-1');

    expect(await screen.findByDisplayValue('Pentavalente')).toBeInTheDocument();
    expect(detailRequests).toBe(0);
  });

  it(
    'elegir en el árbol resuelto rellena vaccineCode/vaccineName y muestra whoCode; sobrescribirlo a mano no lo cambia',
    async () => {
      server.use(
        http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_ID}`, () =>
          HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
        ),
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'HPV', matchCount: 1, vaccineWhodrugId: 'vw-1' }]),
        ),
        http.get('http://localhost:4500/api/whodrug-vaccines/vw-1', () => detailResponse({})),
      );

      renderDialog(null);
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: /HPV/ }, LONG_WAIT));

      // `whoCode` y `vaccineCode` empiezan iguales tras resolver (§3.5).
      expect(await screen.findAllByDisplayValue('CODE-1', {}, LONG_WAIT)).toHaveLength(2);
      expect(screen.getByDisplayValue('Vacuna resuelta')).toBeInTheDocument(); // vaccineName

      const vaccineCodeInput = screen.getAllByDisplayValue('CODE-1')[1]; // whoCode y vaccineCode empiezan iguales
      await user.clear(vaccineCodeInput);
      await user.type(vaccineCodeInput, 'CARNET-9');

      expect(screen.getByDisplayValue('CARNET-9')).toBeInTheDocument();
      // `whoCode` sigue mostrando el original: sobrescribir `vaccineCode` no lo toca (§3.5).
      expect(screen.getByDisplayValue('CODE-1')).toBeInTheDocument();
    },
    90000,
  );

  it(
    '«Asignar sólo la abreviatura» guarda una fila sin FK',
    async () => {
      let requestBody: Record<string, unknown> | null = null;
      server.use(
        http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_ID}`, () =>
          HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
        ),
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'BCG', matchCount: 3, vaccineWhodrugId: null }]),
        ),
        http.post('http://localhost:4500/api/notification-vaccines', async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: vaccineRow({}) });
        }),
      );

      renderDialog(null);
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: /BCG/ }, LONG_WAIT));
      // Sin traducción todavía (paso 13) — el texto renderizado es la clave cruda.
      await user.click(await screen.findByRole('button', { name: 'whodrugTreePicker.assignAbbreviation' }));

      expect(screen.getByDisplayValue('BCG')).toBeInTheDocument(); // vaccineName

      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(requestBody).not.toBeNull());
      expect(requestBody).toMatchObject({ vaccineName: 'BCG', vaccineWhodrugId: null, notificationId: NOTIFICATION_ID });
    },
    60000,
  );

  it('pulsar «Guardar» en la fase 1 habilita los diluyentes sin cerrar el modal', async () => {
    let vaccinePosted = false;
    server.use(
      http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      // Diccionario vacío: el árbol sale deshabilitado, sin necesidad de abrir ningún popover.
      http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () => treeResponse([])),
      http.post('http://localhost:4500/api/notification-vaccines', () => {
        vaccinePosted = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: vaccineRow({ vaccineId: 'v-new', vaccineName: 'Rotavirus' }) });
      }),
      http.get('http://localhost:4500/api/notification-diluents/vaccine/v-new', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    const user = setupUser();
    renderDialog(null);

    expect(await screen.findByText('notificationDiluent.list.needsParent')).toBeInTheDocument();

    const vaccineNameInput = screen.getByLabelText('notificationVaccine.field.vaccineName');
    await user.type(vaccineNameInput, 'Rotavirus');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(vaccinePosted).toBe(true));

    // El modal sigue abierto sobre la fila recién creada, y la sección se habilitó.
    expect(screen.getByDisplayValue('Rotavirus')).toBeInTheDocument();
    expect(screen.queryByText('notificationDiluent.list.needsParent')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /notificationDiluent\.list\.add/ })).toBeInTheDocument();
  });

  it('editar una vacuna existente dispara una sola consulta de diluyentes, y sólo la de esa vacuna', async () => {
    let diluentRequests = 0;
    server.use(
      http.get(`http://localhost:4500/api/notification-vaccines/case/${CASE_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [vaccineRow({ vaccineId: 'v-1' })] } }),
      ),
      http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () => treeResponse([])),
      http.get('http://localhost:4500/api/notification-diluents/vaccine/v-1', () => {
        diluentRequests++;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderDialog('v-1');

    expect(await screen.findByRole('button', { name: /notificationDiluent\.list\.add/ })).toBeInTheDocument();
    expect(diluentRequests).toBe(1);
  });
});
