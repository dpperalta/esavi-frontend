import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useStepReadOnly } from './useStepReadOnly';

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

const notStarted = {
  exists: false,
  id: null,
  startedAt: null,
  endedAt: null,
  durationMinutes: null,
};

function mockWorkflow(statusCode: 'OPEN' | 'CLOSED') {
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
            classification: notStarted,
            notification: notStarted,
            investigation: notStarted,
            finalClassification: notStarted,
          },
        },
      }),
    ),
  );
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Object.assign(wrapper, { queryClient });
}

describe('useStepReadOnly (SPEC FE33 §3.5)', () => {
  it('caso cerrado con SUPERADMIN: reason closed', async () => {
    mockCurrentUser('SUPERADMIN', 100);
    mockWorkflow('CLOSED');

    const { result } = renderHook(() => useStepReadOnly('investigation', 'case-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual({ isReadOnly: true, reason: 'closed' }));
  });

  it('caso abierto con NOTIFIER en investigation: reason role', async () => {
    mockCurrentUser('NOTIFIER', 25);
    mockWorkflow('OPEN');

    const wrapper = createWrapper();
    const { result } = renderHook(() => useStepReadOnly('investigation', 'case-1'), { wrapper });

    // 'role' is also what the hook returns before either query resolves, so the assertion only
    // means something once both reads have landed.
    await waitFor(() => expect(wrapper.queryClient.isFetching()).toBe(0));
    expect(wrapper.queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(result.current).toEqual({ isReadOnly: true, reason: 'role' });
  });

  it('caso cerrado con NOTIFIER en investigation: closed gana a role', async () => {
    mockCurrentUser('NOTIFIER', 25);
    mockWorkflow('CLOSED');

    const { result } = renderHook(() => useStepReadOnly('investigation', 'case-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual({ isReadOnly: true, reason: 'closed' }));
  });

  it('caso abierto con EVALUATOR en investigation: editable', async () => {
    mockCurrentUser('EVALUATOR', 40);
    mockWorkflow('OPEN');

    const { result } = renderHook(() => useStepReadOnly('investigation', 'case-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual({ isReadOnly: false, reason: null }));
  });

  it('sin caso (alta) con USER: reason role, sin pedir el workflow', async () => {
    mockCurrentUser('USER', 20);

    const { result } = renderHook(() => useStepReadOnly('case-opening', undefined), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual({ isReadOnly: true, reason: 'role' }));
  });

  it('sin caso (alta) con NOTIFIER: editable', async () => {
    mockCurrentUser('NOTIFIER', 25);

    const { result } = renderHook(() => useStepReadOnly('patient', undefined), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual({ isReadOnly: false, reason: null }));
  });
});
