// NOT a mirror: the backend builds this response as a literal — `toInvestigationVaccinationContextResponse`
// drops `sysDetails` (own and the nested investigation's) off the Sequelize instance's `toJSON()`,
// so there is no `interface` for `contracts:sync` to copy (SPEC FE13d §3.3). Reconciled by hand if
// the backend changes; `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-vaccination-contexts/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationVaccinationContext.service.ts (INVESTIGATION_INCLUDE,
// MOMENT_INCLUDE, MULTIDOSE_MOMENT_INCLUDE, toInvestigationVaccinationContextResponse). The `006`
// answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once: the row shares its key with its
// investigation, the same pattern as `investigationClinicalEvaluation` and the other one-to-one
// satellites of the investigation.
//
// `moment` and `multidoseMoment` resolve the SAME `vaccinationMoment` catalog through two different
// foreign keys, and travel back with two different aliases (SPEC FE13d §3.2) — they come back
// `null`, never omitted, when their key has no value.
export interface InvestigationVaccinationContextDetail {
  investigationId: string;
  investigation: InvestigationParentRef;
  momentItemId: string | null;
  moment: {
    catalogItemId: string;
    code: string;
    name: string;
    value: string;
  } | null;
  multidoseItemId: string | null;
  multidoseMoment: {
    catalogItemId: string;
    code: string;
    name: string;
    value: string;
  } | null;
  vaccinatedPerVialCount: number | null;
  vaccinatedPerBatchCount: number | null;
  locations: string | null;
  isCluster: AnswerOption | null;
  clusterIdentificationNumber: string | null;
  clusterAdditionalCaseCount: number | null;
  clusterUsedSameVial: AnswerOption | null;
  clusterSameVialCount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
