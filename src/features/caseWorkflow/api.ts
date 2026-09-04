import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseWorkflowListFilters, CompleteCaseWorkflowStageInput } from '@/contracts/caseWorkflow';
import type { CaseWorkflowDetail, CaseWorkflowListRow } from '@/contracts/declared/caseWorkflow';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { ListParams } from '@/shared/api/createResource';
import { client } from '@/shared/api/client';
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
