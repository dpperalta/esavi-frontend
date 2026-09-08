import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { WhodrugTreePicker } from './WhodrugTreePicker';

const server = setupServer();

// `findBy*`/`findAllBy*` poll under `asyncUtilTimeout` (5s, `src/test/setup.ts`), not under the
// `it(..., N)` timeout — which only bounds the whole test function. The same environment stall
// documented in `SearchableSelect.test.tsx` can leave a real resolution mid-flight past 5s even
// while the test itself still has budget left, so every wait in this file that follows a click
// gets this longer, explicit timeout instead.
const LONG_WAIT = { timeout: 30000 };

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
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { value: 'ECU' },
      }),
    ),
  );
});

function treeResponse(options: Array<{ value: string | null; matchCount: number; vaccineWhodrugId: string | null }>) {
  return HttpResponse.json({
    ok: true,
    message: 'ok',
    data: {
      count: options.length,
      total: options.reduce((sum, option) => sum + option.matchCount, 0),
      options,
    },
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
      drugName: 'Vacuna de prueba',
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

function renderPicker(props: Partial<Parameters<typeof WhodrugTreePicker>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onResolve = props.onResolve ?? vi.fn();
  const onClear = props.onClear ?? vi.fn();
  const onAssignAbbreviation = props.onAssignAbbreviation ?? vi.fn();
  return {
    onResolve,
    onClear,
    onAssignAbbreviation,
    ...render(
      <QueryClientProvider client={queryClient}>
        <WhodrugTreePicker
          vaccineWhodrugId={props.vaccineWhodrugId ?? null}
          onResolve={onResolve}
          onClear={onClear}
          onAssignAbbreviation={onAssignAbbreviation}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('WhodrugTreePicker', () => {
  // Same environment stall documented in SearchableSelect.test.tsx: opening this component's
  // Popover-based levels costs real wall time here too. Kept to the minimum number of opens each
  // scenario actually needs, with the timeout raised locally to this file.
  it(
    'una opción con matchCount === 1 en el nivel 1 resuelve el id sin dibujar los niveles restantes',
    async () => {
      server.use(
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([{ value: 'HPV', matchCount: 1, vaccineWhodrugId: 'vw-1' }]),
        ),
        http.get('http://localhost:4500/api/whodrug-vaccines/vw-1', () => detailResponse({})),
      );

      const { onResolve } = renderPicker();
      const user = setupUser();

      expect(await screen.findAllByRole('combobox', {}, LONG_WAIT)).toHaveLength(1);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /HPV/ }, LONG_WAIT));

      // "Vacuna de prueba" appears twice once resolved — the summary heading and the drugName
      // row of the info panel — so the wait is on the unambiguous `<Button>` that only exists in
      // the resolved view, not on the repeated text.
      expect(await screen.findByRole('button', { name: 'whodrugTreePicker.change' }, LONG_WAIT)).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(onResolve).toHaveBeenCalledWith({
        vaccineWhodrugId: 'vw-1',
        whoCode: 'CODE-1',
        vaccineCode: 'CODE-1',
        vaccineName: 'Vacuna de prueba',
      });
    },
    60000,
  );

  it(
    'una opción value:null se muestra "sin especificar" y cambiar el nivel 1 vacía los niveles inferiores',
    async () => {
      const maHoldersRequests: string[] = [];
      server.use(
        http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () =>
          treeResponse([
            { value: 'BCG', matchCount: 3, vaccineWhodrugId: null },
            { value: 'DTP', matchCount: 5, vaccineWhodrugId: null },
          ]),
        ),
        http.get('http://localhost:4500/api/whodrug-vaccines/drug-names', ({ request }) => {
          const abbreviation = new URL(request.url).searchParams.get('abbreviation');
          if (abbreviation === 'BCG') {
            // matchCount > 1 on the null option too — a matchCount of 1 always carries a
            // `vaccineWhodrugId` from the backend (SPEC FE12c §3.2) and would trigger early
            // resolution instead of the cascade this test means to exercise.
            return treeResponse([
              { value: null, matchCount: 2, vaccineWhodrugId: null },
              { value: 'BrandA', matchCount: 1, vaccineWhodrugId: 'vw-branda' },
            ]);
          }
          return treeResponse([{ value: 'BrandB', matchCount: 5, vaccineWhodrugId: null }]);
        }),
        http.get('http://localhost:4500/api/whodrug-vaccines/ma-holders', ({ request }) => {
          maHoldersRequests.push(request.url);
          return treeResponse([{ value: 'HolderX', matchCount: 2, vaccineWhodrugId: null }]);
        }),
      );

      renderPicker();
      const user = setupUser();

      // Nivel 1: BCG (no resuelve, matchCount > 1) → aparece el nivel 2.
      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /BCG/ }, LONG_WAIT));

      // Nivel 2: se elige la opción sin valor — se lee "sin especificar" y debe viajar como
      // __NULL__ al nivel 3 (API-CONTRACT.md §11.2).
      const levelTwoTrigger = (await screen.findAllByRole('combobox', {}, LONG_WAIT))[1];
      await user.click(levelTwoTrigger);
      // `whodrugTreePicker.nullValue` has no translation yet (i18n keys land in paso 13) — react-i18next
      // renders the bare key, which is what this asserts against.
      await user.click(await screen.findByRole('option', { name: /whodrugTreePicker\.nullValue/ }, LONG_WAIT));

      // Nivel 3 (maHolders) aparece para BCG + drugName=__NULL__, y el centinela viajó exacto.
      expect(await screen.findAllByRole('combobox', {}, LONG_WAIT)).toHaveLength(3);
      expect(new URL(maHoldersRequests.at(-1)!).searchParams.get('drugName')).toBe('__NULL__');

      // Cambiar el nivel 1 a DTP vacía drugName y maHolders: el nivel 3 desaparece y el nivel 2
      // vuelve a su placeholder — ya no muestra la opción sin valor que había quedado elegida.
      await user.click(screen.getAllByRole('combobox')[0]);
      await user.click(await screen.findByRole('option', { name: /DTP/ }, LONG_WAIT));

      expect(await screen.findAllByRole('combobox', {}, LONG_WAIT)).toHaveLength(2);
      expect(screen.queryByText(/whodrugTreePicker\.nullValue/)).not.toBeInTheDocument();
    },
    // Three popover opens in one test (level 1 twice, level 2 once), each carrying the same
    // environment stall documented above — the wall-clock cost compounds and 90s occasionally
    // wasn't enough even though every individual step resolves correctly.
    180000,
  );

  it('con el diccionario sin importar, el árbol sale deshabilitado con su explicación', async () => {
    server.use(
      http.get('http://localhost:4500/api/whodrug-vaccines/abbreviations', () => treeResponse([])),
    );

    renderPicker();

    expect(await screen.findByText(/whodrugTreePicker\.notImported/, {}, LONG_WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
