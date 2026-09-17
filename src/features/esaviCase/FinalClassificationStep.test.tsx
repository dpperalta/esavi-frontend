import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { FinalClassificationStep } from './FinalClassificationStep';

const server = setupServer();

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
});

const IMPORTANCE_TYPE = {
  catalogTypeId: 'type-importance',
  code: 'finalClassificationImportance',
  name: 'Importancia',
  description: null,
  sortOrder: 1,
  isActive: true,
  deletedAt: null,
  appDetails: [],
};

function importanceItem(overrides: Record<string, unknown> = {}) {
  return {
    catalogItemId: 'item-1',
    catalogTypeId: 'type-importance',
    code: 'IMPORTANCE_1',
    name: 'Importancia 1',
    value: '1',
    isValueLocked: false,
    description: null,
    sortOrder: 1,
    metadata: null,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function mockCatalog() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 1, rows: [IMPORTANCE_TYPE] } }),
    ),
    http.get('http://localhost:4500/api/catalog-items/type/type-importance', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 3,
          rows: [
            importanceItem(),
            importanceItem({ catalogItemId: 'item-2', code: 'IMPORTANCE_2', name: 'Importancia 2', value: '2', sortOrder: 2 }),
            importanceItem({ catalogItemId: 'item-3', code: 'IMPORTANCE_3', name: 'Importancia 3', value: '3', sortOrder: 3 }),
          ],
        },
      }),
    ),
  );
}

function mockWorkflow(exists: boolean, statusCode = 'OPEN') {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: statusCode, name: statusCode },
          previousStatus: null,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: true, id: 'c-1', startedAt: null, endedAt: '2026-09-01', durationMinutes: 1 },
            notification: { exists: true, id: 'n-1', startedAt: null, endedAt: '2026-09-01', durationMinutes: 1 },
            investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            finalClassification: exists
              ? { exists: true, id: 'fc-1', startedAt: '2026-09-10', endedAt: null, durationMinutes: null }
              : { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
          },
        },
      }),
    ),
  );
}

function baseFinalClassificationDetail(overrides: Record<string, unknown> = {}) {
  return {
    finalClassificationId: 'fc-1',
    case: { caseId: 'case-1', caseCode: 'C-1', isActive: true },
    importanceA: null,
    importanceB: null,
    importanceC: null,
    aIsRelatedToVaccineProduct: null,
    aIsRelatedToQualityDeviation: null,
    aIsRelatedToProgrammaticError: null,
    aIsRelatedToStress: null,
    bIsConsistentTemporalRelation: null,
    bHasDeterminantFactor: null,
    cHasCoincidentCause: null,
    dIsUnclassifiable: null,
    notes: null,
    isActive: true,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function mockFinalClassification(detail: ReturnType<typeof baseFinalClassificationDetail>) {
  server.use(
    http.get('http://localhost:4500/api/final-classifications/case/case-1', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: detail }),
    ),
  );
}

function mockFinalClassificationNotFound() {
  server.use(
    http.get('http://localhost:4500/api/final-classifications/case/case-1', () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'FINCLASS_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

function renderStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinalClassificationStep caseId="case-1" />
    </QueryClientProvider>,
  );
}

describe('FinalClassificationStep — precedencia entre importancias (SPEC FE14a §3.5)', () => {
  it('elegir en B la posición de A deja A en null y muestra el aviso', async () => {
    mockCatalog();
    mockWorkflow(true);
    mockFinalClassification(
      baseFinalClassificationDetail({
        importanceA: { catalogItemId: 'item-1', code: 'IMPORTANCE_1', name: 'Importancia 1', value: '1' },
      }),
    );

    renderStep();
    const user = setupUser();

    const selectA = await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    await waitFor(() => expect(selectA).toHaveTextContent('Importancia 1'));

    const selectB = screen.getByRole('combobox', { name: 'finalClassification.blockB.importance' });
    await user.click(selectB);
    await user.click(await screen.findByRole('option', { name: 'Importancia 1' }));

    await waitFor(() => expect(selectB).toHaveTextContent('Importancia 1'));
    expect(selectA).not.toHaveTextContent('Importancia 1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('FinalClassificationStep — el bloque D (SPEC FE14a §3.5)', () => {
  it('encenderlo oculta A, B y C; apagarlo no restaura lo que había', async () => {
    mockCatalog();
    mockWorkflow(true);
    mockFinalClassification(
      baseFinalClassificationDetail({
        importanceA: { catalogItemId: 'item-1', code: 'IMPORTANCE_1', name: 'Importancia 1', value: '1' },
        aIsRelatedToVaccineProduct: true,
      }),
    );

    renderStep();
    const user = setupUser();

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'finalClassification.blockA.importance' })).toHaveTextContent(
        'Importancia 1',
      ),
    );

    const switchD = screen.getByRole('switch', { name: 'finalClassification.fields.dIsUnclassifiable' });
    await user.click(switchD);

    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'finalClassification.blockA.importance' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('combobox', { name: 'finalClassification.blockB.importance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'finalClassification.blockC.importance' })).not.toBeInTheDocument();

    await user.click(switchD);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'finalClassification.blockA.importance' })).toBeInTheDocument(),
    );
    // Apagar D no restaura: el bloque vuelve a pintarse vacío, no con "Importancia 1".
    expect(screen.getByRole('combobox', { name: 'finalClassification.blockA.importance' })).not.toHaveTextContent(
      'Importancia 1',
    );
  });
});

describe('FinalClassificationStep — los <Switch> tri-estado', () => {
  it('sin tocar sale sin marcar; apagado a mano queda sin marcar también (SPEC FE14a §6)', async () => {
    mockCatalog();
    mockWorkflow(false);
    // La fila no existe todavía: el formulario nace vacío, con los ocho <Switch> en null.
    renderStep();

    const switchA1 = await screen.findByRole('switch', {
      name: 'finalClassification.fields.aIsRelatedToVaccineProduct',
    });
    expect(switchA1).toHaveAttribute('aria-checked', 'false');

    const user = setupUser();
    await user.click(switchA1);
    expect(switchA1).toHaveAttribute('aria-checked', 'true');
    await user.click(switchA1);
    // Apagado a mano: visualmente igual a "nunca tocado" (`aria-checked=false`), pero el valor que
    // guarda el formulario es `false`, no `null` — la distinción viaja en el cuerpo del guardado
    // (verificado en schemas.test.ts `hasVerdict`/`toFormValues` y en las pruebas del paso 8).
    expect(switchA1).toHaveAttribute('aria-checked', 'false');
  });
});

describe('FinalClassificationStep — estados de §3.6', () => {
  it('con exists === true y FINCLASS_006_NOT_FOUND no se pinta el formulario', async () => {
    mockCatalog();
    mockWorkflow(true);
    mockFinalClassificationNotFound();

    renderStep();

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('con exists === false no llama a ESAVI-FINCLASS-006 y pinta el formulario vacío', async () => {
    mockCatalog();
    mockWorkflow(false);
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/final-classifications/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseFinalClassificationDetail() });
      }),
    );

    renderStep();

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'finalClassification.blockA.importance' })).toBeInTheDocument(),
    );
    expect(hit).toBe(false);
  });
});
