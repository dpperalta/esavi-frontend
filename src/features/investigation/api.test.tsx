import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import {
  evaluationInstitutionResource,
  evaluationInstitutionsByInvestigationKey,
  investigationAutopsyResource,
  investigationClinicalEvaluationResource,
  investigationColdChainResource,
  investigationDiagnosticResource,
  investigationMedicalHistoryResource,
  investigationPregnancyConditionResource,
  investigationResource,
  investigationSourceResource,
  investigationTeamMemberResource,
  investigationVaccinationContextResource,
  investigationVaccineAdministeredResource,
  useCreateInvestigationClinicalEvaluation,
  useEvaluationInstitutionsByInvestigation,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationClinicalEvaluationByCase,
  useInvestigationColdChainByCase,
  useInvestigationDiagnosticsByCase,
  useInvestigationMedicalHistoryByCase,
  useInvestigationSourceByCase,
  useInvestigationVaccinationContextByCase,
  useNewbornConditionsByMedicalHistory,
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

const investigationMedicalHistoryDetail = {
  investigationId: 'inv-1',
  investigation: investigationSourceDetail.investigation,
  hasPriorHospitalizationHistory: null,
  priorHospitalizationObservations: null,
  hasFamilyHistory: null,
  familyHistoryObservations: null,
  isPregnancyConfirmed: null,
  gestationalWeeks: null,
  gestationMethodItemId: null,
  deliveryItemId: null,
  birthItemId: null,
  pregnancyOutcomeItemId: null,
  hasPregnancyRiskFactor: null,
  riskFactorDescription: null,
  birthWeightGrams: null,
  wasBreastfed: null,
  notes: null,
  gestationMethod: null,
  delivery: null,
  birth: null,
  pregnancyOutcome: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('investigationMedicalHistoryResource — 1:1 con PK = FK (ESAVI-INVMEDH-001/004)', () => {
  it('el POST lleva investigationId en el cuerpo, a secas', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-medical-histories', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationMedicalHistoryDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationMedicalHistoryResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1' });
  });

  it('el PUT va contra /:investigationId, no contra un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/investigation-medical-histories/inv-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationMedicalHistoryDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationMedicalHistoryResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'inv-1', data: { notes: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-medical-histories/inv-1');
  });

  it('antes de revelarse la sección, un 404 INVMEDH_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-medical-histories/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVMEDH_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationMedicalHistoryByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('con la cabecera de la investigación ausente, INVMEDH_006_INVESTIGATION_NOT_FOUND se propaga', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-medical-histories/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'sin cabecera', code: 'INVMEDH_006_INVESTIGATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationMedicalHistoryByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('investigationPregnancyConditionResource.useListByParent — ESAVI-INVPREG-002A', () => {
  it('pide /investigation/:id con el investigationId de la ficha, no un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.get(
        'http://localhost:4500/api/investigation-pregnancy-conditions/investigation/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 1,
              rows: [
                {
                  pregnancyConditionId: 'cond-1',
                  investigationId: 'inv-1',
                  medicalHistory: {
                    investigationId: 'inv-1',
                    deletedAt: null,
                    investigation: { investigationId: 'inv-1', isActive: true },
                  },
                  diagnosticTermId: null,
                  diagnosticTerm: null,
                  conditionRaw: 'Ictericia',
                  sortOrder: 1,
                  notes: null,
                  isActive: true,
                  createdAt: '2026-09-01T00:00:00.000Z',
                  updatedAt: null,
                  deletedAt: null,
                  appDetails: [],
                },
              ],
            },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNewbornConditionsByMedicalHistory('inv-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-pregnancy-conditions/investigation/inv-1');
    expect(result.current.data?.rows[0].conditionRaw).toBe('Ictericia');
  });

  it('con enabled:false no dispara el GET', async () => {
    let hit = false;
    server.use(
      http.get(
        'http://localhost:4500/api/investigation-pregnancy-conditions/investigation/inv-1',
        () => {
          hit = true;
          return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    renderHook(() => useNewbornConditionsByMedicalHistory('inv-1', false), { wrapper: Wrapper });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hit).toBe(false);
  });
});

describe('investigationPregnancyConditionResource — ESAVI-INVPREG-001/004', () => {
  it('el POST lleva investigationId (de la madre) y conditionName', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        'http://localhost:4500/api/investigation-pregnancy-conditions',
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              pregnancyConditionId: 'cond-1',
              investigationId: 'inv-1',
              medicalHistory: {
                investigationId: 'inv-1',
                deletedAt: null,
                investigation: { investigationId: 'inv-1', isActive: true },
              },
              diagnosticTermId: null,
              diagnosticTerm: null,
              conditionRaw: 'Ictericia',
              sortOrder: 1,
              notes: null,
              isActive: true,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationPregnancyConditionResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1', conditionName: 'Ictericia' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toMatchObject({ investigationId: 'inv-1', conditionName: 'Ictericia' });
  });
});

const investigationClinicalEvaluationDetail = {
  investigationId: 'inv-1',
  investigation: investigationSourceDetail.investigation,
  receivedMedicalAttention: null,
  sourceExam: null,
  sourceDocuments: null,
  sourceVerbalAutopsy: null,
  sourceOther: null,
  otherDescription: null,
  suspectedChildAbuse: null,
  childAbuseExplanation: null,
  suspectedDomesticViolence: null,
  domesticViolenceExplanation: null,
  clinicalDetailsPersonName: null,
  familyClinicalDetails: null,
  completeClinicalSummary: null,
  signsAndSymptoms: null,
  otherSocialBackground: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('useInvestigationClinicalEvaluationByCase — ESAVI-INVCLIEV-006', () => {
  it('antes de revelarse la sección C, un 404 INVCLIEV_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-clinical-evaluations/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVCLIEV_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useInvestigationClinicalEvaluationByCase('case-1', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('con la cabecera de la investigación ausente, INVCLIEV_006_INVESTIGATION_NOT_FOUND se propaga', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-clinical-evaluations/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'sin cabecera', code: 'INVCLIEV_006_INVESTIGATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useInvestigationClinicalEvaluationByCase('case-1', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('investigationClinicalEvaluationResource.useUpdate — ESAVI-INVCLIEV-004', () => {
  it('el PUT va contra /:investigationId, no contra un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put(
        'http://localhost:4500/api/investigation-clinical-evaluations/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationClinicalEvaluationDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationClinicalEvaluationResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'inv-1', data: { notes: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-clinical-evaluations/inv-1');
  });
});

describe('useCreateInvestigationClinicalEvaluation — ESAVI-INVCLIEV-001', () => {
  it('el POST vacío sólo lleva investigationId', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        'http://localhost:4500/api/investigation-clinical-evaluations',
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationClinicalEvaluationDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateInvestigationClinicalEvaluation(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1' });
  });

  it('invalida también la clave de las instituciones, aunque no cree ninguna', async () => {
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: investigationClinicalEvaluationDetail,
        }),
      ),
    );
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useCreateInvestigationClinicalEvaluation(), {
      wrapper: Wrapper,
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate({ investigationId: 'inv-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: evaluationInstitutionsByInvestigationKey('inv-1'),
    });
  });
});

const evaluationInstitutionDetail = {
  evaluationInstitutionId: 'evalinst-1',
  investigationId: 'inv-1',
  sortOrder: 1,
  healthFacilityId: null,
  institutionName: 'Hospital San Juan',
  personName: null,
  personContact: null,
  evaluationInstitutionTypeItemId: null,
  notes: null,
  isActive: true,
  healthFacility: null,
  institutionType: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('useEvaluationInstitutionsByInvestigation — ESAVI-EVALINST-002A', () => {
  it('pide /investigation/:id con el investigationId de la ficha, no un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.get(
        'http://localhost:4500/api/evaluation-institutions/investigation/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 1, rows: [evaluationInstitutionDetail] },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEvaluationInstitutionsByInvestigation('inv-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/evaluation-institutions/investigation/inv-1');
    expect(result.current.data?.rows[0].institutionName).toBe('Hospital San Juan');
  });

  it('con enabled:false no dispara el GET', async () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/evaluation-institutions/investigation/inv-1', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper } = createWrapper();
    renderHook(() => useEvaluationInstitutionsByInvestigation('inv-1', false), {
      wrapper: Wrapper,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hit).toBe(false);
  });
});

describe('evaluationInstitutionResource — ESAVI-EVALINST-001/004', () => {
  it('el POST lleva investigationId (la PK de la ficha de evaluación) en el cuerpo', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/evaluation-institutions', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: evaluationInstitutionDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => evaluationInstitutionResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1', institutionName: 'Hospital San Juan' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({
      investigationId: 'inv-1',
      institutionName: 'Hospital San Juan',
    });
    expect((receivedBody as Record<string, unknown>).sortOrder).toBeUndefined();
  });

  it('el PUT va contra /:evaluationInstitutionId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put(
        'http://localhost:4500/api/evaluation-institutions/evalinst-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({ ok: true, message: 'ok', data: evaluationInstitutionDetail });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => evaluationInstitutionResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'evalinst-1', data: { notes: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/evaluation-institutions/evalinst-1');
  });
});

const investigationDiagnosticDetail = {
  diagnosticId: 'diag-1',
  investigationId: 'inv-1',
  diagnosticTermId: null,
  diagnosticTerm: null,
  diagnosticRaw: 'Fiebre',
  diagnosticDate: null,
  diagnosticTypeItemId: null,
  diagnosticType: null,
  sortOrder: 1,
  notes: null,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('useInvestigationDiagnosticsByCase — ESAVI-INVDIAG-006', () => {
  it('lee por caseId, no por investigationId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.get(
        'http://localhost:4500/api/investigation-diagnostics/case/case-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 1, rows: [investigationDiagnosticDetail] },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationDiagnosticsByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-diagnostics/case/case-1');
    expect(result.current.data?.rows[0].diagnosticRaw).toBe('Fiebre');
  });

  it('con enabled:false no dispara el GET', async () => {
    let hit = false;
    server.use(
      http.get('http://localhost:4500/api/investigation-diagnostics/case/case-1', () => {
        hit = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );
    const { Wrapper } = createWrapper();
    renderHook(() => useInvestigationDiagnosticsByCase('case-1', false), { wrapper: Wrapper });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hit).toBe(false);
  });

  it('un 404 INVDIAG_006_INVESTIGATION_NOT_FOUND se propaga como error', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-diagnostics/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'sin investigación', code: 'INVDIAG_006_INVESTIGATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationDiagnosticsByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('investigationDiagnosticResource — ESAVI-INVDIAG-001/004', () => {
  it('el POST lleva investigationId y diagnosticName, sin sortOrder', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-diagnostics', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDiagnosticDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationDiagnosticResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1', diagnosticName: 'Fiebre' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1', diagnosticName: 'Fiebre' });
    expect((receivedBody as Record<string, unknown>).sortOrder).toBeUndefined();
    expect((receivedBody as Record<string, unknown>).diagnosticTermId).toBeUndefined();
  });

  it('el PUT va contra /:diagnosticId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/investigation-diagnostics/diag-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationDiagnosticDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationDiagnosticResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'diag-1', data: { notes: 'x' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-diagnostics/diag-1');
  });
});

const investigationVaccinationContextDetail = {
  investigationId: 'inv-1',
  investigation: investigationSourceDetail.investigation,
  momentItemId: null,
  moment: null,
  multidoseItemId: null,
  multidoseMoment: null,
  vaccinatedPerVialCount: null,
  vaccinatedPerBatchCount: null,
  locations: null,
  isCluster: null,
  clusterIdentificationNumber: null,
  clusterAdditionalCaseCount: null,
  clusterUsedSameVial: null,
  clusterSameVialCount: null,
  notes: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('investigationVaccinationContextResource — 1:1 con PK = FK (ESAVI-INVVACTX-001/004)', () => {
  it('el POST lleva investigationId en el cuerpo, a secas', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        'http://localhost:4500/api/investigation-vaccination-contexts',
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationVaccinationContextDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationVaccinationContextResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1' });
  });

  it('el PUT va contra /:investigationId, no contra un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put(
        'http://localhost:4500/api/investigation-vaccination-contexts/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationVaccinationContextDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationVaccinationContextResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'inv-1', data: { isCluster: null } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-vaccination-contexts/inv-1');
  });

  it('antes de revelarse la sección D, un 404 INVVACTX_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-vaccination-contexts/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVVACTX_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationVaccinationContextByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('con la cabecera de la investigación ausente, INVVACTX_006_INVESTIGATION_NOT_FOUND se propaga', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-vaccination-contexts/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'sin cabecera', code: 'INVVACTX_006_INVESTIGATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationVaccinationContextByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

const investigationVaccineAdministeredDetail = {
  vaccineAdministeredId: 'vacad-1',
  investigationId: 'inv-1',
  sortOrder: 1,
  vaccineWhodrugId: 'whodrug-1',
  doseNumber: null,
  notes: null,
  isActive: true,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  vaccineWhodrug: { vaccineWhodrugId: 'whodrug-1', drugCode: 'ABC123', drugName: 'BCG vaccine' },
};

describe('investigationVaccineAdministeredResource.useListByParent — ESAVI-INVVACAD-002A', () => {
  it('lista las vacunas activas por investigationId, no por caseId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.get(
        'http://localhost:4500/api/investigation-vaccines-administered/investigation/inv-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 1, rows: [investigationVaccineAdministeredDetail] },
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => investigationVaccineAdministeredResource.useListByParent!('inv-1', { pageSize: 100 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-vaccines-administered/investigation/inv-1');
    expect(result.current.data?.rows[0].vaccineWhodrug?.drugName).toBe('BCG vaccine');
  });
});

describe('investigationVaccineAdministeredResource — ESAVI-INVVACAD-001/004', () => {
  it('el POST lleva investigationId y vaccineWhodrugId, sin sortOrder', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        'http://localhost:4500/api/investigation-vaccines-administered',
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationVaccineAdministeredDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationVaccineAdministeredResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1', vaccineWhodrugId: 'whodrug-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1', vaccineWhodrugId: 'whodrug-1' });
    expect((receivedBody as Record<string, unknown>).sortOrder).toBeUndefined();
  });

  it('el PUT va contra /:vaccineAdministeredId', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put(
        'http://localhost:4500/api/investigation-vaccines-administered/vacad-1',
        ({ request }) => {
          hitUrl = request.url;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationVaccineAdministeredDetail,
          });
        },
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationVaccineAdministeredResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'vacad-1', data: { doseNumber: 0 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-vaccines-administered/vacad-1');
  });
});

const investigationColdChainDetail = {
  investigationId: 'inv-1',
  investigation: { investigationId: 'inv-1', caseId: 'case-1', isActive: true },
  storageTemperatureMonitored: null,
  storageRangeDeviation: null,
  storageProcedureFollowed: null,
  storageOtherObjectPresent: null,
  storagePartiallyReconstitutedVaccine: null,
  storageVaccineNotUsable: null,
  storageDiluentNotUsable: null,
  storageKeyFindings: null,
  transportUsedThermos: null,
  transportSetInThermos: null,
  transportReturnedInThermos: null,
  transportUsedColdPack: null,
  transportTypeThermo: null,
  transportKeyFindings: null,
  notes: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

describe('investigationColdChainResource — 1:1 con PK = FK (ESAVI-INVCOLD-001/004)', () => {
  it('el POST lleva investigationId en el cuerpo, a secas', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-cold-chains', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationColdChainDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationColdChainResource.useCreate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ investigationId: 'inv-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ investigationId: 'inv-1' });
  });

  it('el PUT va contra /:investigationId, no contra un id propio', async () => {
    let hitUrl: string | null = null;
    server.use(
      http.put('http://localhost:4500/api/investigation-cold-chains/inv-1', ({ request }) => {
        hitUrl = request.url;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationColdChainDetail });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => investigationColdChainResource.useUpdate(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: 'inv-1', data: { storageRangeDeviation: false } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hitUrl).toContain('/investigation-cold-chains/inv-1');
  });

  it('antes de revelarse la sección E1, un 404 INVCOLD_006_NOT_FOUND resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-cold-chains/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'no encontrado', code: 'INVCOLD_006_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationColdChainByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('con la cabecera de la investigación ausente, INVCOLD_006_INVESTIGATION_NOT_FOUND se propaga', async () => {
    server.use(
      http.get('http://localhost:4500/api/investigation-cold-chains/case/case-1', () =>
        HttpResponse.json(
          { ok: false, message: 'sin cabecera', code: 'INVCOLD_006_INVESTIGATION_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInvestigationColdChainByCase('case-1', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
