import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
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
    catalogItemId: '11111111-1111-4111-8111-111111111111',
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
            importanceItem({ catalogItemId: '22222222-2222-4222-8222-222222222222', code: 'IMPORTANCE_2', name: 'Importancia 2', value: '2', sortOrder: 2 }),
            importanceItem({ catalogItemId: '33333333-3333-4333-8333-333333333333', code: 'IMPORTANCE_3', name: 'Importancia 3', value: '3', sortOrder: 3 }),
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
      <CaseWizardProvider>
        <FinalClassificationStep caseId="case-1" />
      </CaseWizardProvider>
    </QueryClientProvider>,
  );
}

// Con la barra de acciones montada al lado, como en `ClassificationStep.test.tsx` — «Guardar» y
// «Completar etapa» viven en `CaseWizardActionBar`, atados a `useCaseWizard()` (SPEC FE14a §4
// paso 8).
function renderStepWithActionBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/esavi-cases/case-1/wizard/final-classification']}>
        <CaseWizardProvider>
          <FinalClassificationStep caseId="case-1" />
          <CaseWizardActionBar caseId="case-1" activeSlug="final-classification" />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function clickSaveButton(user: ReturnType<typeof setupUser>) {
  const saveButton = await screen.findByRole('button', { name: 'Guardar' });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await user.click(saveButton);
}

// El mock con estado de §4 paso 8: sigue si la fila existe, y cuenta POST/PUT/GET por separado.
// El workflow devuelve `finalClassification.exists` según ese mismo estado, así que invalidar
// `['caseWorkflow','byCase',caseId]` (lo que hace `useCreateFinalClassification` en su `onSuccess`)
// hace que el siguiente «Guardar» ya vea la fila creada y dispare un `PUT`, no un segundo `POST`.
function mockSaveFlow(options: { postStatus?: number; postCode?: string } = {}) {
  const calls = { post: 0, put: 0, get: 0 };
  let row: Record<string, unknown> | null = null;
  let exists = false;

  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'OPEN' },
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
    http.get('http://localhost:4500/api/final-classifications/case/case-1', () => {
      calls.get += 1;
      if (!row) {
        return HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'FINCLASS_006_NOT_FOUND' },
          { status: 404 },
        );
      }
      return HttpResponse.json({ ok: true, message: 'ok', data: row });
    }),
    http.post('http://localhost:4500/api/final-classifications', async ({ request }) => {
      calls.post += 1;
      if (options.postStatus) {
        return HttpResponse.json(
          { ok: false, message: 'error del servidor', code: options.postCode },
          { status: options.postStatus },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      row = { ...baseFinalClassificationDetail(), ...body, finalClassificationId: 'fc-1' };
      exists = true;
      return HttpResponse.json({ ok: true, message: 'ok', data: row }, { status: 201 });
    }),
    http.put('http://localhost:4500/api/final-classifications/fc-1', async ({ request }) => {
      calls.put += 1;
      const body = (await request.json()) as Record<string, unknown>;
      row = { ...(row ?? baseFinalClassificationDetail()), ...body };
      return HttpResponse.json({ ok: true, message: 'ok', data: row });
    }),
  );

  return {
    calls,
    markRowExists: () => {
      exists = true;
      row = row ?? baseFinalClassificationDetail({ finalClassificationId: 'fc-1' });
    },
  };
}

describe('FinalClassificationStep — precedencia entre importancias (SPEC FE14a §3.5)', () => {
  it('elegir en B la posición de A deja A en null y muestra el aviso', async () => {
    mockCatalog();
    mockWorkflow(true);
    mockFinalClassification(
      baseFinalClassificationDetail({
        importanceA: { catalogItemId: '11111111-1111-4111-8111-111111111111', code: 'IMPORTANCE_1', name: 'Importancia 1', value: '1' },
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
        importanceA: { catalogItemId: '11111111-1111-4111-8111-111111111111', code: 'IMPORTANCE_1', name: 'Importancia 1', value: '1' },
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

describe('FinalClassificationStep — guardar (SPEC FE14a §4 paso 8)', () => {
  it('con exists === false, el primer «Guardar» dispara un solo POST y el siguiente un PUT', async () => {
    mockCatalog();
    const { calls } = mockSaveFlow();

    renderStepWithActionBar();
    const user = setupUser();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    await clickSaveButton(user);

    await waitFor(() => expect(calls.post).toBe(1));
    // El `POST` invalida `['caseWorkflow','byCase',caseId]` (SPEC FE14a §1B): esperar a que el
    // `006` se dispare confirma que el ciclo completo (workflow → exists:true → lectura) terminó
    // antes del segundo «Guardar».
    await waitFor(() => expect(calls.get).toBeGreaterThan(0));

    await clickSaveButton(user);

    await waitFor(() => expect(calls.put).toBe(1));
    expect(calls.post).toBe(1);
  }, 30000);

  it('entrar al paso sin tocar nada no dispara ningún POST', async () => {
    mockCatalog();
    const { calls } = mockSaveFlow();

    renderStepWithActionBar();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls.post).toBe(0);
  });

  it('«Completar etapa» sin veredicto lista el pendiente', async () => {
    mockCatalog();
    mockSaveFlow();

    renderStepWithActionBar();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });

    expect(await screen.findByText('finalClassification.pending.verdict')).toBeInTheDocument();
  });

  it('con D encendido, «Completar etapa» ya no lista el pendiente', async () => {
    mockCatalog();
    mockSaveFlow();

    renderStepWithActionBar();
    const user = setupUser();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    expect(screen.getByText('finalClassification.pending.verdict')).toBeInTheDocument();

    await user.click(
      screen.getByRole('switch', { name: 'finalClassification.fields.dIsUnclassifiable' }),
    );

    await waitFor(() =>
      expect(screen.queryByText('finalClassification.pending.verdict')).not.toBeInTheDocument(),
    );
  });

  it('CASE_ALREADY_FINAL_CLASSIFIED relee la fila y el siguiente guardado es PUT, no un segundo POST', async () => {
    mockCatalog();
    let workflowCalls = 0;
    let postCalls = 0;
    let putCalls = 0;
    const row = baseFinalClassificationDetail({ finalClassificationId: 'fc-1' });

    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () => {
        workflowCalls += 1;
        // La primera lectura es la vista obsoleta del cliente; el `POST` descubre que otra
        // pestaña ya creó la fila, y la relectura tras el 409 trae la verdad (SPEC FE14a §3.5).
        const finalExists = workflowCalls > 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            caseWorkflowId: 'workflow-1',
            caseId: 'case-1',
            status: { catalogItemId: 'status-1', code: 'OPEN', name: 'OPEN' },
            previousStatus: null,
            openedAt: '2026-09-01T00:00:00.000Z',
            closedAt: null,
            lastReopenedAt: null,
            reopenCount: 0,
            stages: {
              classification: { exists: true, id: 'c-1', startedAt: null, endedAt: '2026-09-01', durationMinutes: 1 },
              notification: { exists: true, id: 'n-1', startedAt: null, endedAt: '2026-09-01', durationMinutes: 1 },
              investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
              finalClassification: finalExists
                ? { exists: true, id: 'fc-1', startedAt: '2026-09-10', endedAt: null, durationMinutes: null }
                : { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            },
          },
        });
      }),
      http.get('http://localhost:4500/api/final-classifications/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: row }),
      ),
      http.post('http://localhost:4500/api/final-classifications', () => {
        postCalls += 1;
        return HttpResponse.json(
          {
            ok: false,
            message: 'el caso ya tiene clasificación final',
            code: 'FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED',
          },
          { status: 409 },
        );
      }),
      http.put('http://localhost:4500/api/final-classifications/fc-1', () => {
        putCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: row });
      }),
    );

    renderStepWithActionBar();
    const user = setupUser();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    await clickSaveButton(user);

    await waitFor(() => expect(postCalls).toBe(1));
    // Tras el 409, se relee la fila — el próximo «Guardar» ya ve `finalClassificationId`.
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'finalClassification.blockA.importance' }),
      ).toBeInTheDocument(),
    );

    await clickSaveButton(user);

    await waitFor(() => expect(putCalls).toBe(1));
    expect(postCalls).toBe(1);
  }, 30000);

  it('IMPORTANCE_DUPLICATED queda anclado en la importancia con valor', async () => {
    mockCatalog();
    const { calls } = mockSaveFlow({ postStatus: 400, postCode: 'FINCLASS_001_IMPORTANCE_DUPLICATED' });

    renderStepWithActionBar();
    const user = setupUser();

    const selectA = await screen.findByRole('combobox', {
      name: 'finalClassification.blockA.importance',
    });
    await user.click(selectA);
    await user.click(await screen.findByRole('option', { name: 'Importancia 1' }));

    await clickSaveButton(user);

    await waitFor(() => expect(calls.post).toBe(1));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  }, 30000);

  it('CASEFLOW_012_CASE_CLOSED deja el asistente en sólo lectura', async () => {
    mockCatalog();
    const { calls } = mockSaveFlow({ postStatus: 409, postCode: 'CASEFLOW_012_CASE_CLOSED' });

    renderStepWithActionBar();
    const user = setupUser();

    await screen.findByRole('combobox', { name: 'finalClassification.blockA.importance' });
    await clickSaveButton(user);

    await waitFor(() => expect(calls.post).toBe(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument());
  }, 30000);
});
