// NOT a mirror: the backend builds this response as a literal — `toInvestigationColdChainResponse`
// drops `sysDetails` (own and the nested investigation's) off the Sequelize instance's `toJSON()`,
// so there is no `interface` for `contracts:sync` to copy (SPEC FE13d §3.3). Reconciled by hand if
// the backend changes; `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';

// GET /api/investigation-cold-chains/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationColdChain.service.ts (INVESTIGATION_INCLUDE,
// COLD_CHAIN_EXCLUDE, toInvestigationColdChainResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once, the same pattern as
// `investigationVaccinationContext`. Its `investigation` is flatter than the shared
// `InvestigationParentRef` of the other satellites — this service's own `INVESTIGATION_INCLUDE`
// carries only three columns, with no nested `status` or `case`.
//
// `storageTemperatureMonitored` and `storageRangeDeviation` come back exactly as stored — `true`,
// `false` or `null`, never collapsed: `false` is content, not absence (SPEC FE13d §1.F). The other
// eight `storage*`/`transport*` answers are `AnswerOption`, a different type from those two on the
// very same table (SPEC FE13d §1.D).
export interface InvestigationColdChainDetail {
  investigationId: string;
  investigation: {
    investigationId: string;
    caseId: string;
    isActive: boolean;
  };
  storageTemperatureMonitored: boolean | null;
  storageRangeDeviation: boolean | null;
  storageProcedureFollowed: AnswerOption | null;
  storageOtherObjectPresent: AnswerOption | null;
  storagePartiallyReconstitutedVaccine: AnswerOption | null;
  storageVaccineNotUsable: AnswerOption | null;
  storageDiluentNotUsable: AnswerOption | null;
  storageKeyFindings: string | null;
  transportUsedThermos: AnswerOption | null;
  transportSetInThermos: AnswerOption | null;
  transportReturnedInThermos: AnswerOption | null;
  transportUsedColdPack: AnswerOption | null;
  transportTypeThermo: string | null;
  transportKeyFindings: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
