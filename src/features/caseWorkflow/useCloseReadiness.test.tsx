import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useCloseReadiness } from './useCloseReadiness';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
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
  return Wrapper;
}

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
    caseId: 'case-1',
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

const activeClassification = { classificationId: 'c1', isSeriousEvent: false, isActive: true };
const activeNotification = {
  notificationId: 'n1',
  requestInvestigation: false,
  notificationType: 'NON_SEVERE',
  takesMedication: 'NO',
  outcome: null,
  isActive: true,
};

function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, message: 'ok', data });
}

function notFound(code: string) {
  return HttpResponse.json({ ok: false, message: 'not found', code }, { status: 404 });
}

function emptyMedications() {
  return ok({ count: 0, rows: [] });
}

describe('useCloseReadiness — SPEC FE14b §3.2, §4 paso 3', () => {
  it('un caso con sólo clasificación y notificación hace exactamente tres peticiones', async () => {
    const calls: string[] = [];
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () => {
        calls.push('workflow');
        return ok(workflow({ classification: YES_STAGE, notification: YES_STAGE }));
      }),
      http.get('http://localhost:4500/api/classifications/case/case-1', () => {
        calls.push('classification');
        return ok(activeClassification);
      }),
      http.get('http://localhost:4500/api/notifications/case/case-1', () => {
        calls.push('notification');
        // takesMedication: 'YES' skips the medication fetch (see useCloseReadiness.ts): the
        // check can only ever be 'met' or not-applicable in that branch, so it's never worth a
        // fourth request in this minimal, closable case (SPEC FE14b §5, "exactamente tres").
        return ok({ ...activeNotification, takesMedication: 'YES' });
      }),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useCloseReadiness('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(calls.sort()).toEqual(['classification', 'notification', 'workflow']);
  });

  it('CLASSIF_006_NOT_FOUND con la fase existente da un check "deactivated"', async () => {
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        ok(workflow({ classification: YES_STAGE, notification: YES_STAGE })),
      ),
      http.get('http://localhost:4500/api/classifications/case/case-1', () =>
        notFound('CLASSIF_006_NOT_FOUND'),
      ),
      http.get('http://localhost:4500/api/notifications/case/case-1', () => ok(activeNotification)),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', emptyMedications),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useCloseReadiness('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    const line = result.current.lines.find((l) => l.id === 'classification');
    expect(line?.state).toBe('deactivated');
    expect(result.current.canClose).toBe(false);
  });

  it('una fila con isActive: false da el mismo resultado "deactivated"', async () => {
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        ok(workflow({ classification: YES_STAGE, notification: YES_STAGE })),
      ),
      http.get('http://localhost:4500/api/classifications/case/case-1', () =>
        ok({ ...activeClassification, isActive: false }),
      ),
      http.get('http://localhost:4500/api/notifications/case/case-1', () => ok(activeNotification)),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', emptyMedications),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useCloseReadiness('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    const line = result.current.lines.find((l) => l.id === 'classification');
    expect(line?.state).toBe('deactivated');
  });

  it('un 500 en la comunidad da status: "error"', async () => {
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        ok(
          workflow({
            classification: YES_STAGE,
            notification: YES_STAGE,
            investigation: YES_STAGE,
          }),
        ),
      ),
      http.get('http://localhost:4500/api/classifications/case/case-1', () => ok(activeClassification)),
      http.get('http://localhost:4500/api/notifications/case/case-1', () => ok(activeNotification)),
      http.get('http://localhost:4500/api/investigations/case/case-1', () =>
        ok({ investigationId: 'i1', isActive: true }),
      ),
      http.get('http://localhost:4500/api/investigation-autopsies/case/case-1', () =>
        notFound('INVAUT_006_NOT_FOUND'),
      ),
      http.get('http://localhost:4500/api/investigation-communities/case/case-1', () =>
        HttpResponse.json({ ok: false, message: 'boom', code: 'INTERNAL' }, { status: 500 }),
      ),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', emptyMedications),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useCloseReadiness('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.lines).toEqual([]);
    expect(result.current.canClose).toBe(false);
  });

  it('con takesMedication distinto de YES sí pide la medicación y avisa si hay alguna activa', async () => {
    server.use(
      http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
        ok(workflow({ classification: YES_STAGE, notification: YES_STAGE })),
      ),
      http.get('http://localhost:4500/api/classifications/case/case-1', () => ok(activeClassification)),
      http.get('http://localhost:4500/api/notifications/case/case-1', () => ok(activeNotification)),
      http.get('http://localhost:4500/api/notification-medications/case/case-1', () =>
        ok({ count: 1, rows: [{ medicationId: 'm1', isActive: true }] }),
      ),
    );

    const Wrapper = createWrapper();
    const { result } = renderHook(() => useCloseReadiness('case-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    const line = result.current.lines.find((l) => l.id === 'medicationAnswer');
    expect(line?.kind).toBe('warning');
    expect(line?.state).toBe('unmet');
  });
});
