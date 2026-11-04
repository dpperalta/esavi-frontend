import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CASE_WORKFLOW_STATUS_CODES } from '@/contracts/declared/caseWorkflow';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { usePendingWork } from './api';
import { pendingWorkFixture } from './pendingWorkFixture';

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

describe('usePendingWork — ESAVI-DASH-006', () => {
  it('desenvuelve el envelope y expone generatedAt', async () => {
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingWork(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.generatedAt).toBe('2026-11-04T14:05:00.000Z');
    expect(result.current.data?.openCases).toBe(21);
  });

  it('montarlo dos veces en menos de 60 s hace una sola petición', async () => {
    let requests = 0;
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );
    const { Wrapper } = createWrapper();

    const first = renderHook(() => usePendingWork(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePendingWork(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(requests).toBe(1);
  });

  // SPEC FE34 §7 — the hand-declared codes must match the eight states the backend returns.
  it('los statusCode del embudo coinciden con CASE_WORKFLOW_STATUS_CODES', async () => {
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingWork(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.funnel.map((row) => row.statusCode)).toEqual([...CASE_WORKFLOW_STATUS_CODES]);
  });
});
