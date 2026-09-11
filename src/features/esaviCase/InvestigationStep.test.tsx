import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useDraftsStore } from '@/shared/stores/draftsStore';
import { CaseWizardProvider } from './CaseWizardContext';
import { InvestigationStep } from './InvestigationStep';

const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Leaflet manipula el DOM real con medidas de layout que jsdom no calcula — mismo doble mínimo
// que `MapPointPicker.test.tsx` y `BasicInfoSection.test.tsx`: aquí `<BasicInfoSection>` se monta
// de verdad en cuanto la sección 2 es visible.
vi.mock('leaflet', () => {
  class FakeHandler {
    enable() {}
    disable() {}
  }
  class FakeMarker {
    dragging = new FakeHandler();
    addTo() {
      return this;
    }
    on() {
      return this;
    }
    setLatLng() {}
    getLatLng() {
      return { lat: 0, lng: 0 };
    }
    remove() {}
  }
  class FakeTileLayer {
    addTo() {
      return this;
    }
  }
  class FakeMap {
    dragging = new FakeHandler();
    doubleClickZoom = new FakeHandler();
    scrollWheelZoom = new FakeHandler();
    boxZoom = new FakeHandler();
    keyboard = new FakeHandler();
    touchZoom = new FakeHandler();
    on() {
      return this;
    }
    panTo() {}
    remove() {}
  }
  return {
    default: {
      map: vi.fn(() => new FakeMap()),
      tileLayer: vi.fn(() => new FakeTileLayer()),
      marker: vi.fn(() => new FakeMarker()),
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    },
  };
});

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';
const NOTIFICATION_1 = 'notification-1';

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
  toastInfo.mockClear();
  mockSectionDependencies();
});

// Todo lo que las tres secciones tocan en cuanto se montan de verdad, independientemente de lo
// que cada test quiera comprobar sobre la cabecera — mismo criterio que `mockEmptyCatalogAndSearch`
// de `BasicInfoSection.test.tsx`: vacío por defecto, para no ensuciar la salida con "unhandled
// request" cuando ninguna de estas rutas es lo que el test examina.
function mockSectionDependencies() {
  server.use(
    http.get(`http://localhost:4500/api/investigation-sources/case/${CASE_1}`, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'INVSRC_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    http.get(`http://localhost:4500/api/investigation-autopsies/case/${CASE_1}`, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'INVAUT_006_NOT_FOUND' },
        { status: 404 },
      ),
    ),
    http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: NOTIFICATION_1,
          notificationType: 'NON_SEVERE',
          deathDate: null,
          outcome: null,
          case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01', eventDate: null },
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
    http.get(
      `http://localhost:4500/api/investigation-team-members/investigation/${INVESTIGATION_1}`,
      () => HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/health-facilities/search', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(/\/api\/geo-locations\/.+/, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'GEOLOC_003_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

function mockWorkflow(investigationExists: boolean) {
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: CASE_1,
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
            notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
            investigation: {
              exists: investigationExists,
              id: investigationExists ? INVESTIGATION_1 : null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
          },
          totalDurationMinutes: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
  );
}

function investigationDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    investigationId: INVESTIGATION_1,
    case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', reportDate: '2026-01-01', eventDate: '2026-01-15' },
    status: null,
    vaccinationSite: null,
    vaccinationHealthFacility: null,
    vaccinationGeoLocation: null,
    hospitalizationDate: null,
    investigationStartDate: null,
    vaccinationLatitude: null,
    vaccinationLongitude: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

// El workflow como lo ve la propia invalidación que dispara el `POST` de la cabecera al tener
// éxito: `investigation.exists` pasa a `true` en cuanto `postCount` sube, sin esperar un segundo
// mock por test — mismo mecanismo que el primer test de "vacío pero vivo", extraído para
// reutilizarlo en el revelado progresivo.
function mockWorkflowDynamic(getInvestigationExists: () => boolean) {
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: CASE_1,
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
            notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
            investigation: {
              exists: getInvestigationExists(),
              id: getInvestigationExists() ? INVESTIGATION_1 : null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
          },
          totalDurationMinutes: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      }),
    ),
  );
}

function mockInvestigationDetail(overrides: Partial<Record<string, unknown>> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/investigations/case/${CASE_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail(overrides) }),
    ),
  );
}

function renderInvestigationStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/esavi-cases/${CASE_1}/wizard/investigation`]}>
        <CaseWizardProvider>
          <InvestigationStep caseId={CASE_1} />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvestigationStep — vacío pero vivo (SPEC FE13a §4 paso 6)', () => {
  it('entrar en un caso sin investigación dispara un solo POST', async () => {
    mockWorkflow(false);
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigations', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
      http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            caseWorkflowId: 'workflow-1',
            caseId: CASE_1,
            status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
            previousStatus: null,
            openedAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            lastReopenedAt: null,
            reopenCount: 0,
            stages: {
              classification: { exists: true, id: 'classification-1', startedAt: null, endedAt: null, durationMinutes: null },
              notification: { exists: true, id: 'notification-1', startedAt: null, endedAt: null, durationMinutes: null },
              investigation: { exists: postCount > 0, id: postCount > 0 ? INVESTIGATION_1 : null, startedAt: null, endedAt: null, durationMinutes: null },
              finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
            },
            totalDurationMinutes: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
            deletedAt: null,
            appDetails: [],
          },
        }),
      ),
    );

    renderInvestigationStep();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ caseId: CASE_1 });

    // Se mantiene en 1 aunque el workflow se refresque y confirme `exists:true` (la invalidación
    // que dispara el propio `POST` al tener éxito).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(postCount).toBe(1);
  });

  it('entrar en un caso que ya tiene investigación no dispara ningún POST', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
    );

    renderInvestigationStep();

    await waitFor(() => expect(server).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(postCount).toBe(0);
  });

  it('con el POST en error, no se pinta ningún formulario y hay botón de reintentar', async () => {
    mockWorkflow(false);
    server.use(
      http.post('http://localhost:4500/api/investigations', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya existe', code: 'INVESTGN_001_ALREADY_INVESTIGATED' },
          { status: 409 },
        ),
      ),
    );

    renderInvestigationStep();

    await waitFor(() =>
      expect(screen.getByText('No se pudo iniciar la investigación.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el botón de reintentar vuelve a intentar el POST', async () => {
    mockWorkflow(false);
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        if (postCount === 1) {
          return HttpResponse.json(
            { ok: false, message: 'error', code: 'UNKNOWN_ERROR' },
            { status: 500 },
          );
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
    );

    const user = setupUser();
    renderInvestigationStep();

    await waitFor(() =>
      expect(screen.getByText('No se pudo iniciar la investigación.')).toBeInTheDocument(),
    );
    expect(postCount).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(postCount).toBe(2));
  });
});

describe('InvestigationStep — revelado progresivo y borrador (SPEC FE13a §4 paso 11)', () => {
  it('en un paso nuevo sólo se ve la sección 1, con un botón, y no las otras dos', async () => {
    let postCount = 0;
    mockWorkflowDynamic(() => postCount > 0);
    server.use(
      http.post('http://localhost:4500/api/investigations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() });
      }),
    );

    renderInvestigationStep();

    expect(await screen.findByText('Fuentes de información')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Guardar y continuar' }),
    ).toBeInTheDocument();
    // Sólo un botón — nada de la sección 2 ni de la 3 todavía.
    expect(screen.getAllByRole('button', { name: 'Guardar y continuar' })).toHaveLength(1);
    expect(screen.queryByText('Información básica')).not.toBeInTheDocument();
    expect(screen.queryByText('Datos del equipo de investigación')).not.toBeInTheDocument();
  });

  it('al reentrar en un paso que ya existía se ven las tres secciones y ningún botón intermedio', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();

    renderInvestigationStep();

    expect(await screen.findByText('Fuentes de información')).toBeInTheDocument();
    expect(await screen.findByText('Información básica')).toBeInTheDocument();
    expect(await screen.findByText('Datos del equipo de investigación')).toBeInTheDocument();
    // Nada intermedio: al reentrar, `CaseWizardActionBar` es quien manda, no un botón de sección.
    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
  });

  it('un borrador más viejo que el updatedAt de la cabecera se descarta con aviso', async () => {
    mockWorkflow(true);
    mockInvestigationDetail({ updatedAt: '2026-02-01T00:00:00.000Z' });
    // `baseUpdatedAt` del borrador no coincide con el `updatedAt` real de la fila — la regla de
    // conflicto de `resolveDraftConflict` lo descarta (SPEC FE12a §3.4).
    useDraftsStore.getState().set(CASE_1, 'investigation', { source: { other: true } }, '2026-01-01T00:00:00.000Z');

    renderInvestigationStep();

    await screen.findByText('Fuentes de información');
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith(
        'Se descartaron cambios sin guardar: el caso se editó en otro sitio.',
      ),
    );
    expect(useDraftsStore.getState().get(CASE_1, 'investigation')).toBeUndefined();
  });

  it('un borrador cuyo updatedAt coincide se restaura y avisa, sin bloquear el guardado', async () => {
    mockWorkflow(true);
    mockInvestigationDetail();
    useDraftsStore.getState().set(
      CASE_1,
      'investigation',
      { source: { other: true, otherDescription: 'Fuente comunitaria' } },
      null,
    );

    renderInvestigationStep();

    expect(await screen.findByLabelText('Especifique ¿cuál?')).toHaveValue('Fuente comunitaria');
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith('Se recuperaron cambios sin guardar de una sesión anterior.'),
    );
  });
});
