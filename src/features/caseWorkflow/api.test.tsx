import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useCaseWorkflow, useCompleteStage } from './api';

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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

const caseWorkflowDetail = {
  caseWorkflowId: 'workflow-1',
  caseId: 'case-1',
  status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
  previousStatus: null,
  openedAt: '2026-09-01T00:00:00.000Z',
  closedAt: null,
  lastReopenedAt: null,
  reopenCount: 0,
  stages: {
    classification: { exists: true, id: 'classification-1', startedAt: '2026-09-01', endedAt: null, durationMinutes: null },
    notification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
    investigation: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
    finalClassification: { exists: false, id: null, startedAt: null, endedAt: null, durationMinutes: null },
  },
};

describe('useCaseWorkflow — ESAVI-CASEFLOW-006', () => {
  it('devuelve stages tal como los sirve el mock', async () => {
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseWorkflowDetail }),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCaseWorkflow('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.stages).toEqual(caseWorkflowDetail.stages);
  });
});

describe('useCompleteStage — ESAVI-CASEFLOW-007', () => {
  it('invalida el workflow y el siguiente useCaseWorkflow refetch', async () => {
    let getCalls = 0;
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () => {
        getCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: caseWorkflowDetail });
      }),
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/complete-stage', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: caseWorkflowDetail }),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        workflow: useCaseWorkflow('case-1'),
        complete: useCompleteStage('case-1'),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.workflow.isSuccess).toBe(true));
    expect(getCalls).toBe(1);

    result.current.complete.mutate({ stage: 'CLASSIFICATION' });

    await waitFor(() => expect(result.current.complete.isSuccess).toBe(true));
    await waitFor(() => expect(getCalls).toBe(2));
  });
});
