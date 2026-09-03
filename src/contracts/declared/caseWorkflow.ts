// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE08 §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { CaseWorkflowStageDuration } from '@/contracts/caseWorkflow';

// GET /api/case-workflows/case/:id (ESAVI-CASEFLOW-006) — origin: SPEC F44 §3.7
// `exists` and `id` are deliberately separate fields, not folded into `startedAt`: a stamped
// `startedAt` with `id: null` is a purged row, and hiding the two behind one boolean would
// hide that symptom (F44 §3.7).
export interface CaseWorkflowStageEntry extends CaseWorkflowStageDuration {
  exists: boolean;
  id: string | null;
}

export interface CaseWorkflowDetail {
  caseWorkflowId: string;
  caseId: string;
  status: { catalogItemId: string; code: string; name: string };
  previousStatus: { catalogItemId: string; code: string; name: string } | null;
  openedAt: string;
  closedAt: string | null;
  lastReopenedAt: string | null;
  reopenCount: number;
  stages: Record<
    'classification' | 'notification' | 'investigation' | 'finalClassification',
    CaseWorkflowStageEntry
  >;
}
