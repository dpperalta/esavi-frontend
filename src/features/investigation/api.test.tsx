import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  investigationAutopsyResource,
  investigationResource,
  investigationSourceResource,
  investigationTeamMemberResource,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationSourceByCase,
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

const investigationDetail = {
  investigationId: 'inv-1',
  case: { caseId: 'case-1', caseCode: 'C-1', reportDate: '2026-09-01', eventDate: null },
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
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('useInvestigationByCase — ESAVI-INVESTGN-006', () => {
  it('con enabled:false no dispara el GET', async () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/investigations/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    renderHook(() => useInvestigationByCase('case-1', false), { wrapper: Wrapper });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hit).toBe(false);
  });

  it('con enabled:true trae la cabecera por caso', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigations/case/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail }),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationByCase('case-1', true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.investigationId).toBe('inv-1');
  });
});

describe('investigationResource.useCreate — ESAVI-INVESTGN-001', () => {
  it('el POST vacío sólo lleva caseId', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigations', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationResource.useCreate(), { wrapper: Wrapper });

    result.current.mutate({ caseId: 'case-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ caseId: 'case-1' });
  });
});

const investigationSourceDetail = {
  investigationId: 'inv-1',
  history: null,
  interviewVaccinatedPerson: null,
  interviewHealthWorker: null,
  vaccinationRecord: null,
  autopsyRecord: null,
  verbalAutopsyRecord: null,
  investigationReport: null,
  other: null,
  otherDescription: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  investigation: {
    investigationId: 'inv-1',
    isActive: true,
    investigationStartDate: null,
    status: null,
    case: { caseId: 'case-1', caseCode: 'C-1', eventDate: null },
  },
};

describe('investigationSourceResource — 1:1 con PK = FK (ESAVI-INVSRC-001/004)', () => {
  it('el POST lleva investigationId en el cuerpo', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationSourceDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationSourceResource.useCreate(), { wrapper: Wrapper });

    result.current.mutate({ investigationId: 'inv-1', other: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toMatchObject({ investigationId: 'inv-1' });
  });

  it('el PUT va contra /:investigationId, no contra un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/investigation-sources/inv-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationSourceDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationSourceResource.useUpdate(), { wrapper: Wrapper });

    result.current.mutate({ id: 'inv-1', data: { other: true, otherDescription: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-sources/inv-1');
  });

  it('antes del primer guardado, un 404 INVSRC_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-sources/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVSRC_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationSourceByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

const investigationAutopsyDetail = {
  investigationId: 'inv-1',
  isDeath: true,
  deathDate: '2026-09-01',
  deathTime: null,
  isAutopsyPerformed: null,
  isAutopsyScheduled: null,
  autopsyDate: null,
  scheduledAutopsyDate: null,
  autopsyComments: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  investigation: investigationSourceDetail.investigation,
};

describe('investigationAutopsyResource — 1:1 con PK = FK (ESAVI-INVAUT-001/004)', () => {
  it('el POST lleva investigationId en el cuerpo', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-autopsies', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationAutopsyDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationAutopsyResource.useCreate(), { wrapper: Wrapper });

    result.current.mutate({ investigationId: 'inv-1', isDeath: true, deathDate: '2026-09-01' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toMatchObject({ investigationId: 'inv-1', isDeath: true });
  });

  it('el PUT va contra /:investigationId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/investigation-autopsies/inv-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationAutopsyDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationAutopsyResource.useUpdate(), { wrapper: Wrapper });

    result.current.mutate({ id: 'inv-1', data: { isAutopsyPerformed: false } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-autopsies/inv-1');
  });

  it('sin fila de autopsia todavía, un 404 INVAUT_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-autopsies/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVAUT_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationAutopsyByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('investigationTeamMemberResource.useListByParent — ESAVI-INVTEAM-002A', () => {
  it('lista los miembros activos por investigationId, no por caseId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.get(
        'http://localhost:4500/api/investigation-team-members/investigation/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 1,
              rows: [
                {
                  investigationTeamMemberId: 'member-1',
                  investigationId: 'inv-1',
                  fullName: 'Ana Pérez',
                  institutionName: 'MINSAL',
                  email: null,
                  phone: null,
                  sortOrder: 1,
                  notes: null,
                  isActive: true,
                  createdAt: '2026-09-01T00:00:00.000Z',
                  updatedAt: null,
                  deletedAt: null,
                  appDetails: [],
                  investigation: investigationSourceDetail.investigation,
                },
              ],
            },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => investigationTeamMemberResource.useListByParent!('inv-1', { pageSize: 100 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-team-members/investigation/inv-1');
    expect(result.current.data?.rows[0].fullName).toBe('Ana Pérez');
  });
});
