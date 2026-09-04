// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE08 §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';
import type { CaseWorkflowStageDuration } from '@/contracts/caseWorkflow';

// GET /api/case-workflows/case/:id (ESAVI-CASEFLOW-006) — origin: SPEC F44 §3.7
// `exists` and `id` are deliberately separate fields, not folded into `startedAt`: a stamped
// `startedAt` with `id: null` is a purged row, and hiding the two behind one boolean would
// hide that symptom (F44 §3.7).
export interface CaseWorkflowStageEntry extends CaseWorkflowStageDuration {
  exists: boolean;
  id: string | null;
}

// Shape of `toCatalogRef` (esavi-backend/src/services/caseWorkflow.service.ts), shared by
// `status` and `previousStatus`.
export type CatalogRef = { catalogItemId: string; code: string; name: string };

// The four keys `buildStages` writes, in process order (STAGE_SATELLITE aliases).
export type StageAlias = 'classification' | 'notification' | 'investigation' | 'finalClassification';

// GET /api/esavi-cases/:id (003), /api/case-workflows/case/:id (006), /api/case-workflows (002A)
// and /api/case-workflows/admin (002B) — origin: caseWorkflow.service.ts:300-327,
// `toCaseWorkflowResponse`. It is the **same mapper** behind the 003, the 006 and every row of the
// 002A/002B listing, so it is declared once as the full shape (SPEC FE09 §3.3) instead of as a
// list row and a narrower detail kept in sync by hand.
export interface CaseWorkflowListRow {
  caseWorkflowId: string;
  caseId: string;
  // `null` only when the `include` that resolves the case did not load — should not happen on
  // 002A/006, where it always does. Not an error: the bandeja paints an explicit absence marker.
  caseCode: string | null;
  status: CatalogRef;
  previousStatus: CatalogRef | null;
  openedAt: string;
  closedAt: string | null;
  lastReopenedAt: string | null;
  reopenCount: number;
  stages: Record<StageAlias, CaseWorkflowStageEntry>;
  totalDurationMinutes: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

// Alias, not a parallel type: `toCaseWorkflowResponse` is one mapper for 003, 006 and every row
// of 002A/002B (SPEC FE09 §3.3). Keeping a narrower `CaseWorkflowDetail` here would mean
// redeclaring the same six fields — `caseCode`, `totalDurationMinutes`, `isActive` and the three
// stamps — every time a screen that isn't the wizard needs one of them.
export type CaseWorkflowDetail = CaseWorkflowListRow;
