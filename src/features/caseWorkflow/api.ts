import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompleteCaseWorkflowStageInput } from '@/contracts/caseWorkflow';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import { client } from '@/shared/api/client';

// Hand-written, not createResource (SPEC FE08 §6): caseWorkflow has no 001/004 with an HTTP
// route, it's read by caseId instead of by its own PK, and its writes are action PATCHes
// (007-011), not a CRUD — forcing it into the factory would mean bolting one-off parameters
// onto something that serves 45 regular entities today.

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
