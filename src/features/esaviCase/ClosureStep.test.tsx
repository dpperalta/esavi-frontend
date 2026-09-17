import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { ClosureStep } from './ClosureStep';

const server = setupServer();
const CASE_1 = '44444444-4444-4444-8444-444444444444';

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

const NO_STAGE = { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null };
const YES_STAGE = {
  exists: true,
  id: 'row-1',
  startedAt: '2026-09-01',
  endedAt: null,
  durationMinutes: null,
};

function workflow(stages: Partial<Record<string, typeof YES_STAGE>> = {}) {
  return {
    caseWorkflowId: 'workflow-1',
    caseId: CASE_1,
    status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
    previousStatus: null,
    openedAt: '2026-09-01T00:00:00.000Z',
    closedAt: null,
    lastReopenedAt: null,
    reopenCount: 0,
    stages: {
      classification: NO_STAGE,
      notification: NO_STAGE,
      investigation: NO_STAGE,
      finalClassification: NO_STAGE,
      ...stages,
    },
  };
}

function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, message: 'ok', data });
}

function notFound(code: string) {
  return HttpResponse.json({ ok: false, message: 'not found', code }, { status: 404 });
}

function mockWorkflow(stages: Partial<Record<string, typeof YES_STAGE>>) {
  server.use(
    http.get(`http://localhost:4500/api/case-workflows/case/${CASE_1}`, () => ok(workflow(stages))),
  );
}

function renderStep() {
  const router = createMemoryRouter(
    [{ path: '/esavi-cases/:id/wizard/closure', element: <ClosureStep caseId={CASE_1} /> }],
    { initialEntries: [`/esavi-cases/${CASE_1}/wizard/closure`] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

// SPEC FE14b §4 paso 5
describe('ClosureStep — modo abierto', () => {
  it('con un bloqueo, el botón está deshabilitado y el motivo se lee junto a él', async () => {
    mockWorkflow({ classification: YES_STAGE });
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        ok({ classificationId: 'c1', isSeriousEvent: false, isActive: true }),
      ),
    );

    renderStep();

    const closeButton = await screen.findByRole('button', { name: 'Cerrar expediente' });
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAccessibleDescription(
      'Resuelve lo pendiente para poder cerrar el expediente.',
    );
  });

  it('con sólo avisos, el botón está habilitado y el diálogo los repite', async () => {
    mockWorkflow({ classification: YES_STAGE, notification: YES_STAGE });
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        ok({ classificationId: 'c1', isSeriousEvent: false, isActive: true }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
        ok({
          notificationId: 'n1',
          requestInvestigation: false,
          notificationType: 'NON_SEVERE',
          takesMedication: 'NO',
          outcome: null,
          isActive: true,
        }),
      ),
      http.get(`http://localhost:4500/api/notification-medications/case/${CASE_1}`, () =>
        ok({ count: 1, rows: [{ medicationId: 'm1', isActive: true }] }),
      ),
    );

    const user = setupUser();
    renderStep();

    const closeButton = await screen.findByRole('button', { name: 'Cerrar expediente' });
    await waitFor(() => expect(closeButton).toBeEnabled());

    await user.click(closeButton);

    const matches = await screen.findAllByText(
      /Hay 1 medicaciones registradas, pero la pregunta sobre medicación dice «No»\./,
    );
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('confirmar hace un PATCH …/close', async () => {
    mockWorkflow({ classification: YES_STAGE, notification: YES_STAGE });
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        ok({ classificationId: 'c1', isSeriousEvent: false, isActive: true }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
        ok({
          notificationId: 'n1',
          requestInvestigation: false,
          notificationType: 'NON_SEVERE',
          takesMedication: 'YES',
          outcome: null,
          isActive: true,
        }),
      ),
    );
    let closeCalls = 0;
    server.use(
      http.patch(`http://localhost:4500/api/case-workflows/case/${CASE_1}/close`, () => {
        closeCalls++;
        return ok(workflow({ classification: YES_STAGE, notification: YES_STAGE }));
      }),
    );

    const user = setupUser();
    renderStep();

    const closeButton = await screen.findByRole('button', { name: 'Cerrar expediente' });
    await waitFor(() => expect(closeButton).toBeEnabled());
    await user.click(closeButton);

    const confirmButtons = await screen.findAllByRole('button', { name: 'Cerrar expediente' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(closeCalls).toBe(1));
  });

  it('el enlace «Revisar la autopsia» navega al paso de investigación', async () => {
    mockWorkflow({ classification: YES_STAGE, notification: YES_STAGE, investigation: YES_STAGE });
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        ok({ classificationId: 'c1', isSeriousEvent: false, isActive: true }),
      ),
      http.get(`http://localhost:4500/api/notifications/case/${CASE_1}`, () =>
        ok({
          notificationId: 'n1',
          requestInvestigation: true,
          notificationType: 'NON_SEVERE',
          takesMedication: 'YES',
          outcome: null,
          isActive: true,
        }),
      ),
      http.get(`http://localhost:4500/api/investigations/case/${CASE_1}`, () =>
        ok({ investigationId: 'i1', isActive: true }),
      ),
      http.get(`http://localhost:4500/api/investigation-autopsies/case/${CASE_1}`, () =>
        ok({ investigationId: 'i1', investigation: { investigationId: 'i1', isActive: true } }),
      ),
      http.get(`http://localhost:4500/api/investigation-communities/case/${CASE_1}`, () =>
        notFound('INVCOMM_006_NOT_FOUND'),
      ),
    );

    const user = setupUser();
    const router = renderStep();

    const link = await screen.findByRole('button', { name: 'Revisar la autopsia' });
    await user.click(link);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/esavi-cases/${CASE_1}/wizard/investigation`),
    );
  });

  it('con una lectura en error aparece «Reintentar» y el botón sigue deshabilitado', async () => {
    mockWorkflow({ classification: YES_STAGE });
    server.use(
      http.get(`http://localhost:4500/api/classifications/case/${CASE_1}`, () =>
        HttpResponse.json({ ok: false, message: 'boom', code: 'INTERNAL' }, { status: 500 }),
      ),
    );

    renderStep();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cerrar expediente' })).toBeDisabled();
  });
});
