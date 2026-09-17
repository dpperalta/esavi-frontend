import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  finalClassificationByCaseKey,
  finalClassificationResource,
  useCreateFinalClassification,
  useFinalClassificationByCase,
} from './api';

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

const finalClassificationDetail = {
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
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('useFinalClassificationByCase — ESAVI-FINCLASS-006', () => {
  it('con enabled:false no dispara el GET', async () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/final-classifications/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: finalClassificationDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    renderHook(() => useFinalClassificationByCase('case-1', false), { wrapper: Wrapper });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hit).toBe(false);
  });

  it('con enabled:true trae la fila por caso', async () => {
    server.use(
      http.get('http://localhost:4500/api/final-classifications/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: finalClassificationDetail }),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useFinalClassificationByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.finalClassificationId).toBe('fc-1');
  });

  it('un 404 FINCLASS_006_NOT_FOUND se propaga como error, no se traga en null', async () => {
    server.use(
      http.get('http://localhost:4500/api/final-classifications/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'FINCLASS_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useFinalClassificationByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'FINCLASS_006_NOT_FOUND' });
  });
});

describe('useCreateFinalClassification — ESAVI-FINCLASS-001', () => {
  it('el POST vacío sólo lleva caseId', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/final-classifications', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: finalClassificationDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateFinalClassification(), { wrapper: Wrapper });

    result.current.mutate({ caseId: 'case-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ caseId: 'case-1' });
  });

  it('invalida la clave propia y la del workflow del caso', async () => {
    server.use(
      http.post('http://localhost:4500/api/final-classifications', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: finalClassificationDetail }),
      ),
    );
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useCreateFinalClassification(), { wrapper: Wrapper });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate({ caseId: 'case-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finalClassification'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseWorkflow', 'byCase', 'case-1'],
    });
  });
});

describe('finalClassificationResource.useUpdate — ESAVI-FINCLASS-004', () => {
  it('el PUT va contra /:finalClassificationId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/final-classifications/fc-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: finalClassificationDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => finalClassificationResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'fc-1', data: { notes: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/final-classifications/fc-1');
  });
});

describe('finalClassificationByCaseKey', () => {
  it('produce la clave de caché por caso', () => {
    expect(finalClassificationByCaseKey('case-1')).toEqual([
      'finalClassification',
      'byCase',
      'case-1',
    ]);
  });
});
