import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseWorkflowListFilters, CompleteCaseWorkflowStageInput } from '@/contracts/caseWorkflow';
import type { CaseWorkflowDetail, CaseWorkflowListRow } from '@/contracts/declared/caseWorkflow';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { ListParams } from '@/shared/api/createResource';
import { client } from '@/shared/api/client';
import { EsaviApiError } from '@/shared/api/types';
import { useCan } from '@/shared/hooks/useCan';
import { ROLE_LEVELS } from '@/shared/config/roles';

// Hand-written, not createResource (SPEC FE08 §6): caseWorkflow has no 001/004 with an HTTP
// route, it's read by caseId instead of by its own PK, and its writes are action PATCHes
// (007-011), not a CRUD — forcing it into the factory would mean bolting one-off parameters
// onto something that serves 45 regular entities today. FE09 §4.6 adds `useCaseWorkflowList`
// for the same reason: a second hook by hand, not a `createResource` declaration.

function caseWorkflowByCaseKey(caseId: string) {
  return ['caseWorkflow', 'byCase', caseId] as const;
}

// ESAVI-CASEFLOW-006 — status, stamps and stages.<stage>.{exists, id} in one call
async function fetchCaseWorkflowByCase(caseId: string): Promise<CaseWorkflowDetail> {
  const response = await client.get<CaseWorkflowDetail>(`/case-workflows/case/${caseId}`);
  return response.data;
}

export function useCaseWorkflow(caseId: string | undefined) {
  return useQuery({
    queryKey: caseWorkflowByCaseKey(caseId ?? ''),
    queryFn: () => fetchCaseWorkflowByCase(caseId as string),
    enabled: caseId !== undefined,
    // No staleTime (SPEC FE08 §6): the workflow changes with every action bar click, and a
    // stale read shows a step unlocked that isn't — refetch cost is cheaper than a wrong
    // decision about which button to show.
  });
}

// ESAVI-CASEFLOW-007 — stamps <stage>EndedAt
async function completeCaseWorkflowStage(
  caseId: string,
  payload: CompleteCaseWorkflowStageInput,
): Promise<CaseWorkflowDetail> {
  const response = await client.patch<CaseWorkflowDetail>(
    `/case-workflows/case/${caseId}/complete-stage`,
    payload,
  );
  return response.data;
}

// ESAVI-CASEFLOW-002A (active) / ESAVI-CASEFLOW-002B (admin, incl. inactive) — the status inbox.
// `002B` requires ADMIN (API-ROUTES.md:100); a USER stays on `002A` even with `includeInactive`
// in the URL, same rule createResource applies for the other 44 entities (CONVENTIONS.md §6.5).
function toOffsetLimit({ page, pageSize }: ListParams): { limit: number; offset: number } {
  return { limit: pageSize, offset: ((page ?? 1) - 1) * pageSize };
}

async function fetchCaseWorkflowList(
  url: string,
  limit: number,
  offset: number,
  filters: CaseWorkflowListFilters | undefined,
): Promise<PaginatedResponse<CaseWorkflowListRow>> {
  const response = await client.get<PaginatedResponse<CaseWorkflowListRow>>(url, {
    params: { limit, offset, ...filters },
  });
  return response.data;
}

export function useCaseWorkflowList(params: ListParams & { filters?: CaseWorkflowListFilters }) {
  const canViewAdminPath = useCan(ROLE_LEVELS.ADMIN);
  const { limit, offset } = toOffsetLimit(params);
  const includeInactive = !!params.includeInactive && canViewAdminPath;
  const url = includeInactive ? '/case-workflows/admin' : '/case-workflows';
  const filters = params.filters;

  return useQuery({
    queryKey: ['caseWorkflow', 'list', { limit, offset, includeInactive, filters }],
    queryFn: () => fetchCaseWorkflowList(url, limit, offset, filters),
  });
}

// ESAVI-CASEFLOW-008 — no body; answers the full workflow
async function closeCaseWorkflow(caseId: string): Promise<CaseWorkflowDetail> {
  const response = await client.patch<CaseWorkflowDetail>(`/case-workflows/case/${caseId}/close`);
  return response.data;
}

// ESAVI-CASEFLOW-009 — no body; answers the full workflow
async function reopenCaseWorkflow(caseId: string): Promise<CaseWorkflowDetail> {
  const response = await client.patch<CaseWorkflowDetail>(`/case-workflows/case/${caseId}/reopen`);
  return response.data;
}

// ESAVI-CASEFLOW-010 — no body (F44 forbids a client-sent statusItemId); answers the full workflow
async function requestCaseValidation(caseId: string): Promise<CaseWorkflowDetail> {
  const response = await client.patch<CaseWorkflowDetail>(
    `/case-workflows/case/${caseId}/request-validation`,
  );
  return response.data;
}

// ESAVI-CASEFLOW-011 — no body; restores previousStatus server-side and answers the full workflow
async function resolveCaseValidation(caseId: string): Promise<CaseWorkflowDetail> {
  const response = await client.patch<CaseWorkflowDetail>(
    `/case-workflows/case/${caseId}/resolve-validation`,
  );
  return response.data;
}

// The seven phase reads the closure step evaluates (SPEC FE14b §3.4). Keys are repeated here
// instead of imported: a feature doesn't import another feature's api (CONVENTIONS.md §3).
const CLOSE_READINESS_ENTITIES = [
  'classification',
  'notification',
  'investigation',
  'finalClassification',
  'investigationAutopsy',
  'investigationCommunity',
  'notificationMedication',
] as const;

function invalidateWorkflowTransition(queryClient: QueryClient, caseId: string) {
  void queryClient.invalidateQueries({ queryKey: caseWorkflowByCaseKey(caseId) });
  void queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'list'] });
  void queryClient.invalidateQueries({ queryKey: ['esaviCase'] });
}

function isConflictOf(error: unknown, codePrefix: string): boolean {
  return error instanceof EsaviApiError && error.status === 409 && !!error.code?.startsWith(codePrefix);
}

export function useCloseCase(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => closeCaseWorkflow(caseId),
    onSuccess: () => invalidateWorkflowTransition(queryClient, caseId),
    onError: (error) => {
      // A 409 means the local checklist was stale (another tab or user): re-reading every phase
      // explains the rejection better than the toast alone (SPEC FE14b §3.4, §6).
      if (!isConflictOf(error, 'CASEFLOW_008_')) return;
      invalidateWorkflowTransition(queryClient, caseId);
      for (const entity of CLOSE_READINESS_ENTITIES) {
        void queryClient.invalidateQueries({ queryKey: [entity, 'byCase', caseId] });
      }
    },
  });
}

export function useReopenCase(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => reopenCaseWorkflow(caseId),
    onSuccess: () => invalidateWorkflowTransition(queryClient, caseId),
    onError: (error) => {
      // Another administrator already reopened it.
      if (isConflictOf(error, 'CASEFLOW_009_NOT_CLOSED')) {
        void queryClient.invalidateQueries({ queryKey: caseWorkflowByCaseKey(caseId) });
      }
    },
  });
}

// SPEC FE23 §3.4 — these three 409s mean another tab or user got there first; re-reading `006`
// shows the right button (or read-only, if the case closed meanwhile).
const VALIDATION_CONFLICT_CODES = [
  'CASEFLOW_010_ALREADY_PENDING',
  'CASEFLOW_010_CASE_CLOSED',
  'CASEFLOW_011_NOT_PENDING',
] as const;

function useValidationTransition(
  caseId: string,
  mutationFn: (caseId: string) => Promise<CaseWorkflowDetail>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => mutationFn(caseId),
    onSuccess: () => invalidateWorkflowTransition(queryClient, caseId),
    onError: (error) => {
      if (VALIDATION_CONFLICT_CODES.some((code) => isConflictOf(error, code))) {
        void queryClient.invalidateQueries({ queryKey: caseWorkflowByCaseKey(caseId) });
      }
    },
  });
}

export function useRequestValidation(caseId: string) {
  return useValidationTransition(caseId, requestCaseValidation);
}

export function useResolveValidation(caseId: string) {
  return useValidationTransition(caseId, resolveCaseValidation);
}

export function useCompleteStage(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CompleteCaseWorkflowStageInput) =>
      completeCaseWorkflowStage(caseId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: caseWorkflowByCaseKey(caseId) });
    },
  });
}
