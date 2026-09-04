// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE11 §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET .../classifications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/classification.service.ts:73-79 (toClassificationResponse),
// DETAIL_EXCLUDE, CASE_INCLUDE, AGE_UNIT_INCLUDE
export interface ClassificationDetail {
  classificationId: string;
  age: number | null;
  firstConsultationDate: string | null;
  isSeriousEvent: boolean | null;
  causedDeath: boolean | null;
  causedDisability: boolean | null;
  causedCongenitalAnomaly: boolean | null;
  causedFetalDeath: boolean | null;
  causedLifeThreatening: boolean | null;
  causedHospitalization: boolean | null;
  causedAbortion: boolean | null;
  causedOtherCondition: boolean | null;
  otherSeriousConditionDescription: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  case: { caseId: string; caseCode: string; reportDate: string | null; eventDate: string | null };
  ageUnit: { catalogItemId: string; code: string; name: string; value: string | null } | null;
}
