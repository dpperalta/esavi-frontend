import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';
import type { CreateInvestigationMedicalHistoryInput } from '@/contracts/investigationMedicalHistory';
import type { CreateInvestigationPregnancyConditionInput } from '@/contracts/investigationPregnancyCondition';
import type { CreateInvestigationClinicalEvaluationInput } from '@/contracts/investigationClinicalEvaluation';
import type { CreateEvaluationInstitutionInput } from '@/contracts/evaluationInstitution';
import type { CreateInvestigationDiagnosticInput } from '@/contracts/investigationDiagnostic';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationTeamMemberDetail } from '@/contracts/declared/investigationTeamMember';
import type { InvestigationMedicalHistoryDetail } from '@/contracts/declared/investigationMedicalHistory';
import type { InvestigationPregnancyConditionDetail } from '@/contracts/declared/investigationPregnancyCondition';
import type { InvestigationClinicalEvaluationDetail } from '@/contracts/declared/investigationClinicalEvaluation';
import type { EvaluationInstitutionDetail } from '@/contracts/declared/evaluationInstitution';
import type { InvestigationDiagnosticDetail } from '@/contracts/declared/investigationDiagnostic';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';
import { EsaviApiError } from '@/shared/api/types';

// POST   /api/investigations               ESAVI-INVESTGN-001  USER  create the header, `{ caseId }` only (SPEC FE13a §2)
// GET    /api/investigations/case/:id      ESAVI-INVESTGN-006  USER  by case, in reentry — hand-written below
// PUT    /api/investigations/:id           ESAVI-INVESTGN-004  USER  update
// Out of scope (SPEC FE13a §3.2): `-002A`/`-002B` (backoffice-wide listings, the wizard always
// enters by case), `-003` (the `006` above covers reentry), `-005A`/`-005B`/`-005C` (the wizard
// cleans with a `PUT`, it never deactivates, reactivates or purges the header).
export const investigationResource = createResource<
  InvestigationDetail,
  CreateInvestigationInput,
  Partial<CreateInvestigationInput>
>({
  key: 'investigation',
  path: 'investigations',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationByCaseKey(caseId: string) {
  return ['investigation', 'byCase', caseId] as const;
}

// ESAVI-INVESTGN-006 — by caseId, not by the row's own PK, same reasoning as
// `useNotificationByCase` (SPEC FE13a §3.4). `enabled` follows `stages.investigation.exists`,
// passed in by the caller: a fresh case has no header yet and the `POST` at mount is what creates
// it (SPEC FE13a §3.6, `InvestigationStep`).
export function useInvestigationByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<InvestigationDetail>(`investigations/case/${caseId}`);
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-sources       ESAVI-INVSRC-001  USER  create — carries `investigationId` in the body
// PUT  /api/investigation-sources/:id   ESAVI-INVSRC-004  USER  update — `:id` IS the investigationId
// `investigationId` is primary key and foreign key at once (CASE-PROCESS.md §5.5.2), so
// `createResource`'s generic `/:id` shape already lands on the right route without a custom hook.
// Out of scope (SPEC FE13a §3.2): `-002A`/`-002B` (global), `-003` (the `006` below covers
// reentry), `-005C` (SUPERADMIN purge — the wizard cleans with a `PUT`, never deletes).
export const investigationSourceResource = createResource<
  InvestigationSourceDetail,
  CreateInvestigationSourceInput,
  Partial<CreateInvestigationSourceInput>
>({
  key: 'investigationSource',
  path: 'investigation-sources',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationSourceByCaseKey(caseId: string) {
  return ['investigationSource', 'byCase', caseId] as const;
}

// ESAVI-INVSRC-006 — one object, not a list (SPEC FE13a §3.2). Before the first "Guardar y
// continuar" of the section, the investigation header exists but this satellite doesn't yet
// (SPEC FE13a §2, §3.6) — same "confirmed, no row yet" shape as `useNotificationPregnancyByNotification`,
// inferred from the `<PREFIX>_006_NOT_FOUND` the sibling satellites already use; reconcile the
// exact code against `investigationSource.service.ts` if the backend ever answers otherwise.
export function useInvestigationSourceByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationSourceByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationSourceDetail>(
          `investigation-sources/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVSRC_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-autopsies       ESAVI-INVAUT-001  USER  create — carries `investigationId` in the body
// PUT  /api/investigation-autopsies/:id   ESAVI-INVAUT-004  USER  update — `:id` IS the investigationId
// Same 1:1 shape as its source sibling above.
export const investigationAutopsyResource = createResource<
  InvestigationAutopsyDetail,
  CreateInvestigationAutopsyInput,
  Partial<CreateInvestigationAutopsyInput>
>({
  key: 'investigationAutopsy',
  path: 'investigation-autopsies',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationAutopsyByCaseKey(caseId: string) {
  return ['investigationAutopsy', 'byCase', caseId] as const;
}

// ESAVI-INVAUT-006. Mirrors its source sibling above in every respect: one object, and
// "confirmed, no row yet" until the death block has been saved at least once (a row only exists
// over a death — SPEC FE13a §3.5 C).
export function useInvestigationAutopsyByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationAutopsyByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationAutopsyDetail>(
          `investigation-autopsies/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVAUT_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-team-members                     ESAVI-INVTEAM-001   USER  add a member
// GET  /api/investigation-team-members/investigation/:id   ESAVI-INVTEAM-002A  USER  active members, by parent — `useListByParent` below
// PUT  /api/investigation-team-members/:id                 ESAVI-INVTEAM-004   USER  edit a member
// `investigationTeamMemberId` is its own PK, minted by the database (unlike its two 1:1 siblings
// above) — a proper list of rows, not a satellite object. Out of scope (SPEC FE13a §2):
// `-005A`/`-005B`/`-005C` — deleting a member is blocked on `CASE-PROCESS.md` §10 lowering
// `-005A` from ADMIN to USER, so no delete hook exists here at all.
export const investigationTeamMemberResource = createResource<
  InvestigationTeamMemberDetail,
  CreateInvestigationTeamMemberInput,
  Partial<CreateInvestigationTeamMemberInput>
>({
  key: 'investigationTeamMember',
  path: 'investigation-team-members',
  idField: 'investigationTeamMemberId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
  parent: {
    operation: 'byInvestigation',
    segment: 'investigation/:parentId',
  },
});

// POST /api/investigation-medical-histories             ESAVI-INVMEDH-001  USER  create — carries `investigationId` in the body, no other field required (SPEC FE13b §2)
// GET  /api/investigation-medical-histories/case/:id    ESAVI-INVMEDH-006  USER  by case, one object — hand-written below
// PUT  /api/investigation-medical-histories/:id         ESAVI-INVMEDH-004  USER  update — `:id` IS the investigationId
// Same 1:1 shape as investigationSource and investigationAutopsy above (SPEC FE13b §3.2).
export const investigationMedicalHistoryResource = createResource<
  InvestigationMedicalHistoryDetail,
  CreateInvestigationMedicalHistoryInput,
  Partial<CreateInvestigationMedicalHistoryInput>
>({
  key: 'investigationMedicalHistory',
  path: 'investigation-medical-histories',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationMedicalHistoryByCaseKey(caseId: string) {
  return ['investigationMedicalHistory', 'byCase', caseId] as const;
}

// ESAVI-INVMEDH-006 — one object, not a list. Unlike its two 1:1 siblings above,
// `INVMEDH_006_NOT_FOUND` is the normal state before section B's opening `POST` and the only code
// swallowed into `null`: `INVMEDH_006_INVESTIGATION_NOT_FOUND` (the header itself is missing) is
// left to propagate, because that is a different failure — the screen sends the user back to the
// top of the step, where FE13a creates the header (SPEC FE13b §3.5).
export function useInvestigationMedicalHistoryByCase(
  caseId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: investigationMedicalHistoryByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationMedicalHistoryDetail>(
          `investigation-medical-histories/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVMEDH_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// GET  /api/investigation-pregnancy-conditions/investigation/:id  ESAVI-INVPREG-002A  USER  active conditions, by the medical history's own id — `useListByParent` below
// POST /api/investigation-pregnancy-conditions                    ESAVI-INVPREG-001   USER  add a condition
// PUT  /api/investigation-pregnancy-conditions/:id                ESAVI-INVPREG-004   USER  edit a condition
// `investigationId` names the medical history's own PK, not the investigation (SPEC FE13b §1 B) —
// the cache operation reads `byMedicalHistory` on purpose, even though the URL segment is
// `investigation/:parentId`, so the trap stays visible in the code (SPEC FE13b §3.4, §6). Out of
// scope (SPEC FE13b §2): `-005A`/`-005B` (ADMIN, blocked on CASE-PROCESS.md §10), `-005C`
// (SUPERADMIN purge).
export const investigationPregnancyConditionResource = createResource<
  InvestigationPregnancyConditionDetail,
  CreateInvestigationPregnancyConditionInput,
  Partial<CreateInvestigationPregnancyConditionInput>
>({
  key: 'investigationPregnancyCondition',
  path: 'investigation-pregnancy-conditions',
  idField: 'pregnancyConditionId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
  parent: {
    operation: 'byMedicalHistory',
    segment: 'investigation/:parentId',
  },
});

// Wraps `useListByParent` with the explicit `enabled` the B2 gate needs: the list must not run
// before the medical history exists, and an empty `parentId` is what keeps the factory's own
// `enabled: !!parentId` off in that case (SPEC FE13b §4 paso 2).
export function useNewbornConditionsByMedicalHistory(
  investigationId: string | undefined,
  enabled: boolean,
) {
  return investigationPregnancyConditionResource.useListByParent!(
    enabled ? (investigationId ?? '') : '',
    { pageSize: 100 },
  );
}

// POST /api/investigation-clinical-evaluations             ESAVI-INVCLIEV-001  USER  create the ficha, `{ investigationId }` only, on section C's reveal (SPEC FE13c §2)
// GET  /api/investigation-clinical-evaluations/case/:id    ESAVI-INVCLIEV-006  USER  by case, in reentry — hand-written below
// PUT  /api/investigation-clinical-evaluations/:id          ESAVI-INVCLIEV-004  USER  update — `:id` IS the investigationId
// Same 1:1 shape as investigationSource, investigationAutopsy and investigationMedicalHistory
// above (SPEC FE13c §3.1). `useCreate` off this resource is deliberately unused: the `POST` has to
// invalidate the institutions' cache key too, which the factory cannot know about, so
// `useCreateInvestigationClinicalEvaluation` below replaces it.
export const investigationClinicalEvaluationResource = createResource<
  InvestigationClinicalEvaluationDetail,
  CreateInvestigationClinicalEvaluationInput,
  Partial<CreateInvestigationClinicalEvaluationInput>
>({
  key: 'investigationClinicalEvaluation',
  path: 'investigation-clinical-evaluations',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationClinicalEvaluationByCaseKey(caseId: string) {
  return ['investigationClinicalEvaluation', 'byCase', caseId] as const;
}

// ESAVI-INVCLIEV-006 — one object, not a list. `INVCLIEV_006_NOT_FOUND` is the normal state
// before section C's opening `POST` and the only code swallowed into `null`, same criterion as
// `useInvestigationMedicalHistoryByCase` above: `INVCLIEV_006_INVESTIGATION_NOT_FOUND` and
// `INVCLIEV_006_CASE_NOT_FOUND` are left to propagate — two different failures the screen sends
// the investigator to fix in two different places (SPEC FE13c §3.2, §3.6).
export function useInvestigationClinicalEvaluationByCase(
  caseId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: investigationClinicalEvaluationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationClinicalEvaluationDetail>(
          `investigation-clinical-evaluations/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVCLIEV_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// ESAVI-INVCLIEV-001 — hand-written instead of the factory's `useCreate`: this `POST` invalidates
// the evaluation institutions' cache key too, even though it creates no institution (SPEC FE13c
// §1.B, §3.4). It is what turns the `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` the nested
// list answers before the ficha exists into an operational list the moment it is created, with no
// page reload.
export function useCreateInvestigationClinicalEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvestigationClinicalEvaluationInput) => {
      const response = await client.post<InvestigationClinicalEvaluationDetail>(
        'investigation-clinical-evaluations',
        input,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['investigationClinicalEvaluation'] });
      void queryClient.invalidateQueries({
        queryKey: evaluationInstitutionsByInvestigationKey(variables.investigationId),
      });
    },
  });
}

// POST /api/evaluation-institutions                    ESAVI-EVALINST-001   USER  add an institution — carries `investigationId` (the clinical evaluation's own PK) in the body
// GET  /api/evaluation-institutions/investigation/:id   ESAVI-EVALINST-002A  USER  active institutions, by the clinical evaluation's own id — `useListByParent` below
// PUT  /api/evaluation-institutions/:id                 ESAVI-EVALINST-004   USER  edit an institution
// `evaluationInstitutionId` is its own PK, minted by the database — a proper list of rows, not a
// 1:1 satellite (SPEC FE13c §3.1). Out of scope (SPEC FE13c §2): `-005A`/`-005B` (ADMIN, blocked
// on `CASE-PROCESS.md` §10), `-005C` (SUPERADMIN purge).
export const evaluationInstitutionResource = createResource<
  EvaluationInstitutionDetail,
  CreateEvaluationInstitutionInput,
  Partial<CreateEvaluationInstitutionInput>
>({
  key: 'evaluationInstitution',
  path: 'evaluation-institutions',
  idField: 'evaluationInstitutionId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
  parent: {
    operation: 'byInvestigation',
    segment: 'investigation/:parentId',
  },
});

export function evaluationInstitutionsByInvestigationKey(investigationId: string) {
  return ['evaluationInstitution', 'byInvestigation', investigationId] as const;
}

// Wraps `useListByParent` with the explicit `enabled` the section needs: the list must not run
// before the clinical evaluation ficha exists — before that, `investigationId` cannot be known to
// resolve, and an empty `parentId` is what keeps the factory's own `enabled: !!parentId` off in
// that case, same shape as `useNewbornConditionsByMedicalHistory` above (SPEC FE13c §3.4).
export function useEvaluationInstitutionsByInvestigation(
  investigationId: string | undefined,
  enabled: boolean,
) {
  return evaluationInstitutionResource.useListByParent!(
    enabled ? (investigationId ?? '') : '',
    { pageSize: 100 },
  );
}

// POST /api/investigation-diagnostics             ESAVI-INVDIAG-001  USER  add a diagnostic
// GET  /api/investigation-diagnostics/case/:id     ESAVI-INVDIAG-006  USER  by case, one page — hand-written below
// PUT  /api/investigation-diagnostics/:id          ESAVI-INVDIAG-004  USER  edit a diagnostic
// `diagnosticId` is its own PK, and the table hangs from `investigation` directly, not from the
// clinical evaluation (SPEC FE13c §1.F) — no `parent` config: the list is read from the case's
// `006`, never from a `byInvestigation` listing, so the screen never needs to know
// `investigationId` before reading. Out of scope (SPEC FE13c §2): `-005A`/`-005B` (ADMIN, blocked
// on `CASE-PROCESS.md` §10), `-005C` (SUPERADMIN purge).
export const investigationDiagnosticResource = createResource<
  InvestigationDiagnosticDetail,
  CreateInvestigationDiagnosticInput,
  Partial<CreateInvestigationDiagnosticInput>
>({
  key: 'investigationDiagnostic',
  path: 'investigation-diagnostics',
  idField: 'diagnosticId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationDiagnosticsByCaseKey(caseId: string) {
  return ['investigationDiagnostic', 'byCase', caseId] as const;
}

// ESAVI-INVDIAG-006 — the real query of the domain: the client holds the caseId, not the
// investigationId (SPEC FE13c §6.12). The two distinguishable `404` propagate as-is —
// `INVDIAG_006_CASE_NOT_FOUND` and `INVDIAG_006_INVESTIGATION_NOT_FOUND` — because they are two
// different actions on the investigator's side (SPEC FE13c §3.2). An investigation with no
// diagnoses answers `200` with an empty page, never `404`, so nothing here is swallowed to `null`.
export function useInvestigationDiagnosticsByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationDiagnosticsByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<InvestigationDiagnosticDetail>>(
        `investigation-diagnostics/case/${caseId}`,
      );
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}
