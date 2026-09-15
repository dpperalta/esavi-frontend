// NOT a mirror: the backend builds this response as a literal — `toInvestigationClinicalEvaluationResponse`
// drops `sysDetails` (own and the nested investigation's) off the Sequelize instance's `toJSON()`, so
// there is no `interface` for `contracts:sync` to copy (SPEC FE13c §3.3). Reconciled by hand if the
// backend changes; `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-clinical-evaluations/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationClinicalEvaluation.service.ts (INVESTIGATION_INCLUDE,
// toInvestigationClinicalEvaluationResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once: the row shares its key with its
// investigation, the same pattern as `investigationMedicalHistory` and `investigationAutopsy`.
//
// `receivedMedicalAttention` and the six booleans come back exactly as stored — `true`, `false` or
// `null` — never collapsed: a `null` means the form did not collect the answer, and on the two
// suspicions "no sospecha" and "no evaluado" are different affirmations (SPEC FE13c §1.D).
//
// `clinicalDetailsPersonName` is DECRYPTED by the backend before it leaves the service: the
// ciphertext never crosses the HTTP boundary. It comes back in `Title Case` (§8).
//
// There is no `isActive`: the table does not have that column, only `deletedAt`. The real visibility
// is inherited from `investigation.isActive`.
export interface InvestigationClinicalEvaluationDetail {
  investigationId: string;
  investigation: InvestigationParentRef;
  receivedMedicalAttention: AnswerOption | null;
  sourceExam: boolean | null;
  sourceDocuments: boolean | null;
  sourceVerbalAutopsy: boolean | null;
  sourceOther: boolean | null;
  otherDescription: string | null;
  suspectedChildAbuse: boolean | null;
  childAbuseExplanation: string | null;
  suspectedDomesticViolence: boolean | null;
  domesticViolenceExplanation: string | null;
  clinicalDetailsPersonName: string | null;
  familyClinicalDetails: string | null;
  completeClinicalSummary: string | null;
  signsAndSymptoms: string | null;
  otherSocialBackground: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
