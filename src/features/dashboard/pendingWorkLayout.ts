import type { CaseWorkflowStatusCode } from '@/contracts/declared/caseWorkflow';

export type PendingWorkList = 'stalled' | 'pendingInvestigations';

export interface PendingWorkLayout {
  emphasizedStatuses: ReadonlySet<CaseWorkflowStatusCode>;
  listOrder: readonly PendingWorkList[];
}

const DEFAULT_LIST_ORDER: readonly PendingWorkList[] = ['stalled', 'pendingInvestigations'];

const NO_EMPHASIS: ReadonlySet<CaseWorkflowStatusCode> = new Set();

// SPEC FE34 §3.6 — only the case-stage roles get emphasis. USER, ADMIN and SUPERADMIN fall
// through to the default: everyone sees the same four sub-blocks, the role only reorders and
// highlights (F65 §8, note 1).
export function getPendingWorkLayout(roleName: string | null): PendingWorkLayout {
  switch (roleName?.toUpperCase()) {
    case 'NOTIFIER':
      return {
        emphasizedStatuses: new Set(['OPEN', 'IN_CLASSIFICATION', 'IN_NOTIFICATION']),
        listOrder: DEFAULT_LIST_ORDER,
      };
    case 'INVESTIGATOR':
      return { emphasizedStatuses: NO_EMPHASIS, listOrder: ['pendingInvestigations', 'stalled'] };
    case 'EVALUATOR':
      return { emphasizedStatuses: new Set(['IN_FINAL_CLASSIFICATION']), listOrder: DEFAULT_LIST_ORDER };
    default:
      return { emphasizedStatuses: NO_EMPHASIS, listOrder: DEFAULT_LIST_ORDER };
  }
}
