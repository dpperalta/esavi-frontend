import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';

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

function mockWorkflow(classificationExists: boolean) {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: {
            classification: {
              exists: classificationExists,
              id: classificationExists ? 'c-1' : null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            notification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            investigation: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
            finalClassification: {
              exists: false,
              id: null,
              startedAt: null,
              endedAt: null,
              durationMinutes: null,
            },
          },
        },
      }),
    ),
  );
}

function renderActionBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseWizardProvider>
          <CaseWizardActionBar caseId="case-1" activeSlug="classification" />
        </CaseWizardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseWizardActionBar', () => {
  it('con un paso sin registrar (placeholder de FE08) la barra no lanza y Guardar queda deshabilitado', async () => {
    mockWorkflow(false);

    renderActionBar();

    const saveButton = await screen.findByRole('button', { name: 'Guardar' });
    expect(saveButton).toBeDisabled();
  });

  it("con stages.classification.exists === false el botón 'Completar etapa' está deshabilitado", async () => {
    mockWorkflow(false);

    renderActionBar();

    const completeStageButton = await screen.findByRole('button', { name: 'Completar etapa' });
    expect(completeStageButton).toBeDisabled();
  });

  it("con stages.classification.exists === true el botón 'Completar etapa' está habilitado", async () => {
    mockWorkflow(true);

    renderActionBar();

    const completeStageButton = await screen.findByRole('button', { name: 'Completar etapa' });
    expect(completeStageButton).toBeEnabled();
  });
});
