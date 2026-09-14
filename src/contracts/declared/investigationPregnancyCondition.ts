// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE13b §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// GET /api/investigation-pregnancy-conditions/investigation/:id (002A), POST (001), PUT (004) —
// origin: esavi-backend/src/services/investigationPregnancyCondition.service.ts
// (RESPONSE_ATTRIBUTES, MEDICAL_HISTORY_INCLUDE, DIAGNOSTIC_TERM_INCLUDE,
// toInvestigationPregnancyConditionResponse).
//
// `investigationId` names the medical history and not the investigation: it is the primary key of
// `investigationMedicalHistory`, which shares its key with its parent — the trap SPEC FE13b §1 B
// warns about. The `/investigation/:id` route resolves against that same UUID.
//
// `diagnosticTerm` comes back `null` when the condition was recorded free-text with no code
// resolved. What the screen shows is `conditionRaw ?? diagnosticTerm.name` — there is no third field
// that resolves it.
export interface InvestigationPregnancyConditionDetail {
  pregnancyConditionId: string;
  investigationId: string;
  medicalHistory: {
    investigationId: string;
    deletedAt: string | null;
    investigation: { investigationId: string; isActive: boolean };
  };
  diagnosticTermId: string | null;
  diagnosticTerm: {
    diagnosticTermId: string;
    source: TermSource;
    code: string | null;
    name: string;
    termGroup: string | null;
    isActive: boolean;
  } | null;
  conditionRaw: string | null;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
