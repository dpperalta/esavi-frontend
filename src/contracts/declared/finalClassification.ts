// NOT a mirror: the backend builds this response as a literal — `toFinalClassificationResponse`
// drops `sysDetails`, `caseId` and the three raw `importance*ItemId` off the Sequelize instance's
// `toJSON()`, so there is no `interface` for `contracts:sync` to copy (SPEC FE14a §3.3). Reconciled
// by hand if the backend changes; `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET /api/final-classifications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/finalClassification.service.ts (toFinalClassificationResponse,
// DETAIL_INCLUDE, DETAIL_EXCLUDE, CASE_INCLUDE, importanceInclude).
//
// The eight booleans and the three importance slots are returned exactly as stored, `null`
// included: a verdict that was never evaluated is not normalized to `false` or dropped (SPEC
// FE14a §1E). `dIsUnclassifiable` is not in the same list as the ten it closes — it is the flag,
// not one of the fields it forbids.
//
// `caseId` and the three `importance*ItemId` never arrive: the response carries the resolved
// `case` and `importanceA`/`importanceB`/`importanceC` instead, each with `required: false` so a
// final classification that only ranked one block does not vanish from the read.
export interface FinalClassificationDetail {
  finalClassificationId: string;
  case: { caseId: string; caseCode: string; isActive: boolean };
  importanceA: CatalogItemRef | null;
  importanceB: CatalogItemRef | null;
  importanceC: CatalogItemRef | null;
  aIsRelatedToVaccineProduct: boolean | null;
  aIsRelatedToQualityDeviation: boolean | null;
  aIsRelatedToProgrammaticError: boolean | null;
  aIsRelatedToStress: boolean | null;
  bIsConsistentTemporalRelation: boolean | null;
  bHasDeterminantFactor: boolean | null;
  cHasCoincidentCause: boolean | null;
  dIsUnclassifiable: boolean | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

interface CatalogItemRef {
  catalogItemId: string;
  code: string;
  name: string;
  value: string | null;
}
