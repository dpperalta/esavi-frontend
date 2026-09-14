// NOT a mirror: the backend builds this response as a literal — `toInvestigationMedicalHistoryResponse`
// drops `sysDetails` off the Sequelize instance's `toJSON()`, so there is no `interface` for
// `contracts:sync` to copy (SPEC FE13b §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-medical-histories/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationMedicalHistory.service.ts (MEDICAL_HISTORY_EXCLUDE,
// CATALOG_INCLUDES, toInvestigationMedicalHistoryResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once, like investigationAutopsy — the row
// shares its key with its investigation.
//
// This response carries both the raw keys (`gestationMethodItemId`…) and the four resolved objects:
// the form reads and sends the keys, and the objects only paint the name without a second fetch
// (SPEC FE13b §3.3). The four resolved objects carry `catalogItemId`, `code` and `name` — never
// `value` — which is why the B2 gate compares against the catalog loaded by `<CatalogSelect>`
// instead of against this response (SPEC FE13b §3.3, CASE-PROCESS.md §7.2).
//
// `birthWeightGrams` comes back as a string — `numeric(8,2)` through pg — and is deliberate: coercing
// it in the backend would force reconverting it before comparing in the differential update. The
// client parses it building `defaultValues` and sends it back as a number.
//
// There is no `isActive`: the table does not have that column, only `deletedAt`.
export interface InvestigationMedicalHistoryDetail {
  investigationId: string;
  investigation: InvestigationParentRef;
  hasPriorHospitalizationHistory: AnswerOption | null;
  priorHospitalizationObservations: string | null;
  hasFamilyHistory: AnswerOption | null;
  familyHistoryObservations: string | null;
  isPregnancyConfirmed: AnswerOption | null;
  gestationalWeeks: number | null;
  gestationMethodItemId: string | null;
  deliveryItemId: string | null;
  birthItemId: string | null;
  pregnancyOutcomeItemId: string | null;
  hasPregnancyRiskFactor: AnswerOption | null;
  riskFactorDescription: string | null;
  birthWeightGrams: string | null;
  wasBreastfed: AnswerOption | null;
  notes: string | null;
  gestationMethod: CatalogItemRef | null;
  delivery: CatalogItemRef | null;
  birth: CatalogItemRef | null;
  pregnancyOutcome: CatalogItemRef | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

interface CatalogItemRef {
  catalogItemId: string;
  code: string;
  name: string;
}
