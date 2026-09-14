// NOT a mirror: the backend builds this response as a literal — `toEvaluationInstitutionResponse`
// picks `RESPONSE_ATTRIBUTES` one by one and drops the `clinicalEvaluation` parent chain off the
// Sequelize instance's `toJSON()`, so there is no `interface` for `contracts:sync` to copy
// (SPEC FE13c §3.3). Reconciled by hand if the backend changes; `contracts:sync` never writes into
// this folder.
import type { AppDetails } from '@/contracts/common';

// POST /api/evaluation-institutions (001), GET /api/evaluation-institutions/investigation/:id
// (002A), PUT /api/evaluation-institutions/:id (004) — origin:
// esavi-backend/src/services/evaluationInstitution.service.ts (RESPONSE_ATTRIBUTES,
// HEALTH_FACILITY_INCLUDE, INSTITUTION_TYPE_INCLUDE, toEvaluationInstitutionResponse).
//
// `investigationId` names the clinical evaluation, not the investigation: it is the primary key of
// `investigationClinicalEvaluation`, which shares its key with its parent (SPEC FE13c §1.B). The
// nested `clinicalEvaluation`/`investigation` chain the service reads to enforce visibility never
// reaches this response — whoever needs it enters through `ESAVI-INVCLIEV-006`.
//
// `personName` and `personContact` are DECRYPTED by the backend before they leave the service: the
// ciphertext never crosses the HTTP boundary.
//
// `healthFacility` and `institutionType` come back as an explicit `null` when their key has no
// value — the client never has to tell "empty" from "absent". The name the screen shows is
// `institutionName ?? healthFacility.name`; there is no third field that resolves it.
//
// `sortOrder` travels because the two listings order by it, but the client never sends it back
// (SPEC FE13c §3.3): it is assigned by `TRG_evaluationInstitution_setSortOrder`.
export interface EvaluationInstitutionDetail {
  evaluationInstitutionId: string;
  investigationId: string;
  sortOrder: number | null;
  healthFacilityId: string | null;
  institutionName: string | null;
  personName: string | null;
  personContact: string | null;
  evaluationInstitutionTypeItemId: string | null;
  notes: string | null;
  isActive: boolean;
  healthFacility: {
    healthFacilityId: string;
    localCode: string | null;
    name: string;
    isActive: boolean;
  } | null;
  institutionType: {
    catalogItemId: string;
    code: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
