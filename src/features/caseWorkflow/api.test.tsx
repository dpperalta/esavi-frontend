import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useCaseWorkflow, useCaseWorkflowList, useCloseCase, useCompleteStage, useReopenCase } from './api';

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

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

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

const PHASE_READ_ENTITIES = [
  'classification',
  'notification',
  'investigation',
  'finalClassification',
  'investigationAutopsy',
  'investigationCommunity',
  'notificationMedication',
];

const TRANSITION_KEYS = [
  ['caseWorkflow', 'byCase', 'case-1'],
  ['caseWorkflow', 'list', {}],
  ['esaviCase', 'detail', 'case-1'],
];

// Seeds every key the transitions may invalidate, so `isInvalidated` can be read on each one.
function seedCache(queryClient: QueryClient) {
  for (const key of TRANSITION_KEYS) queryClient.setQueryData(key, {});
  for (const entity of PHASE_READ_ENTITIES) queryClient.setQueryData([entity, 'byCase', 'case-1'], {});
}

function invalidatedKeys(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => query.queryKey);
}

function conflict(code: string) {
  return HttpResponse.json({ ok: false, message: 'conflict', code }, { status: 409 });
}

describe('useCloseCase — ESAVI-CASEFLOW-008', () => {
  it('sale sin body y con 200 invalida las tres claves del workflow', async () => {
    let body: string | null = null;
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/close', async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: caseWorkflowDetail });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    seedCache(queryClient);
    const { result } = renderHook(() => useCloseCase('case-1'), { wrapper: Wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toBe('');
    expect(invalidatedKeys(queryClient)).toEqual(expect.arrayContaining(TRANSITION_KEYS));
    expect(invalidatedKeys(queryClient)).toHaveLength(3);
  });

  it('con 409 CASEFLOW_008_INVESTIGATION_REQUIRED invalida las diez claves', async () => {
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/close', () =>
        conflict('CASEFLOW_008_INVESTIGATION_REQUIRED'),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    seedCache(queryClient);
    const { result } = renderHook(() => useCloseCase('case-1'), { wrapper: Wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedKeys(queryClient)).toHaveLength(10);
  });

  it('con 500 CASEFLOW_008_CLOSE_FAILED no invalida nada', async () => {
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/close', () =>
        HttpResponse.json({ ok: false, message: 'boom', code: 'CASEFLOW_008_CLOSE_FAILED' }, { status: 500 }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    seedCache(queryClient);
    const { result } = renderHook(() => useCloseCase('case-1'), { wrapper: Wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedKeys(queryClient)).toHaveLength(0);
  });
});

describe('useReopenCase — ESAVI-CASEFLOW-009', () => {
  it('sale sin body y con 200 invalida las tres claves del workflow', async () => {
    let body: string | null = null;
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/reopen', async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: caseWorkflowDetail });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    seedCache(queryClient);
    const { result } = renderHook(() => useReopenCase('case-1'), { wrapper: Wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toBe('');
    expect(invalidatedKeys(queryClient)).toEqual(expect.arrayContaining(TRANSITION_KEYS));
    expect(invalidatedKeys(queryClient)).toHaveLength(3);
  });

  it('con 409 CASEFLOW_009_NOT_CLOSED invalida sólo el workflow', async () => {
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/reopen', () =>
        conflict('CASEFLOW_009_NOT_CLOSED'),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    seedCache(queryClient);
    const { result } = renderHook(() => useReopenCase('case-1'), { wrapper: Wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedKeys(queryClient)).toEqual([['caseWorkflow', 'byCase', 'case-1']]);
  });
});

// ESAVI-CASEFLOW-002A / 002B — SPEC FE09 §4.6
describe('useCaseWorkflowList', () => {
  it('con nivel USER e includeInactive:true, pega a /case-workflows (no al admin)', async () => {
    mockCurrentUser('USER', 25);
    let hitPlain = false;
    server.use(
      http.get('http://localhost:4500/api/case-workflows', () => {
        hitPlain = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
      http.get('http://localhost:4500/api/case-workflows/admin', () =>
        HttpResponse.json({ ok: false, message: 'forbidden', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );

    const { Wrapper } = createWrapper();
    renderHook(() => useCaseWorkflowList({ pageSize: 10, includeInactive: true }), { wrapper: Wrapper });

    await waitFor(() => expect(hitPlain).toBe(true));
  });

  it('con nivel ADMIN e includeInactive:true, pega a /case-workflows/admin', async () => {
    mockCurrentUser('ADMIN', 50);
    let hitAdmin = false;
    server.use(
      http.get('http://localhost:4500/api/case-workflows/admin', () => {
        hitAdmin = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const { Wrapper } = createWrapper();
    renderHook(() => useCaseWorkflowList({ pageSize: 10, includeInactive: true }), { wrapper: Wrapper });

    await waitFor(() => expect(hitAdmin).toBe(true));
  });

  it('los tres filtros de la bandeja viajan como query params', async () => {
    mockCurrentUser('USER', 25);
    let receivedParams: URLSearchParams | null = null;
    server.use(
      http.get('http://localhost:4500/api/case-workflows', ({ request }) => {
        receivedParams = new URL(request.url).searchParams;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    const { Wrapper } = createWrapper();
    renderHook(
      () =>
        useCaseWorkflowList({
          pageSize: 10,
          filters: { statusCode: 'IN_INVESTIGATION', openedFrom: '2026-01-01', openedTo: '2026-03-01' },
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(receivedParams).not.toBeNull());
    expect(receivedParams?.get('statusCode')).toBe('IN_INVESTIGATION');
    expect(receivedParams?.get('openedFrom')).toBe('2026-01-01');
    expect(receivedParams?.get('openedTo')).toBe('2026-03-01');
  });

  it('la clave de caché cambia cuando cambia cualquiera de los filtros', async () => {
    mockCurrentUser('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/case-workflows', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );
    const { Wrapper, queryClient } = createWrapper();

    const { result, rerender } = renderHook(
      ({ statusCode }: { statusCode?: string }) =>
        useCaseWorkflowList({ pageSize: 10, filters: statusCode ? { statusCode } : undefined }),
      { wrapper: Wrapper, initialProps: { statusCode: undefined } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ statusCode: 'CLOSED' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryCache().findAll({ queryKey: ['caseWorkflow', 'list'] }).length).toBe(2);
  });
});
