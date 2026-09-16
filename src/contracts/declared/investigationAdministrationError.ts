// NOT a mirror: the backend builds this response as a literal —
// `toInvestigationAdministrationErrorResponse` drops `sysDetails` (own and the nested
// investigation's) off the Sequelize instance's `toJSON()`, so there is no `interface` for
// `contracts:sync` to copy (SPEC FE13e §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';

// GET /api/investigation-administration-errors/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationAdministrationError.service.ts (INVESTIGATION_INCLUDE,
// ADMINISTRATION_ERROR_EXCLUDE, toInvestigationAdministrationErrorResponse). The `006` answers one
// object, not a list.
//
// `investigationId` is primary key and foreign key at once, the same pattern as
// `investigationColdChain`. Its `investigation` carries the same three columns as every other
// satellite of the step — no nested `status` or `case`.
//
// THE FOUR SYRINGE TYPES ARE boolean | null AND NOT AnswerOption | null, while the flag that
// governs them (`usedAutoDisableSyringes`) is AnswerOption | null. It is the asymmetry of the DDL
// carried into the contract without softening it (SPEC FE13e §1.A): the four have three states and
// the twelve `had*` answers have five. `false` is content, not absence, on the four types.
export interface InvestigationAdministrationErrorDetail {
  investigationId: string;
  investigation: {
    investigationId: string;
    caseId: string;
    isActive: boolean;
  };
  usedAutoDisableSyringes: AnswerOption | null;
  usedGlassSyringes: boolean | null;
  usedDisposableSyringes: boolean | null;
  usedRecycledDisposableSyringes: boolean | null;
  usedOtherSyringes: boolean | null;
  otherSyringesDescription: string | null;
  syringesKeyFindings: string | null;
  reconstitutionUsedSameSyringe: AnswerOption | null;
  reconstitutionUsedSameSyringeDifferentVaccine: AnswerOption | null;
  reconstitutionUsedDifferentSyringeSameVial: AnswerOption | null;
  reconstitutionUsedDifferentSyringeDifferentVaccine: AnswerOption | null;
  reconstitutionFollowedManufacturerRecommendation: AnswerOption | null;
  reconstitutionKeyFindings: string | null;
  hadPrescriptionError: AnswerOption | null;
  prescriptionErrorNotes: string | null;
  hadContaminatedVaccine: AnswerOption | null;
  contaminatedVaccineNotes: string | null;
  hadAbnormalVaccineConditions: AnswerOption | null;
  abnormalConditionsNotes: string | null;
  hadPreparationError: AnswerOption | null;
  preparationErrorNotes: string | null;
  hadHandlingError: AnswerOption | null;
  handlingErrorNotes: string | null;
  hadImproperAdministration: AnswerOption | null;
  improperAdministrationNotes: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
