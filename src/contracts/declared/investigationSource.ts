// NOT a mirror: the backend builds this response as a literal — `toInvestigationSourceResponse`
// drops `sysDetails` off the Sequelize instance's `toJSON()`, so there is no `interface` for
// `contracts:sync` to copy (SPEC FE13a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-sources/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationSource.service.ts (SOURCE_EXCLUDE,
// INVESTIGATION_INCLUDE, toInvestigationSourceResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once: it identifies the row and its
// investigation, which is why the `POST` carries it in the body and the `PUT` goes to
// `/:investigationId` (CASE-PROCESS.md §5.5.2).
//
// The eight flags are tri-state and come back exactly as stored: `null` is "not collected" and
// `false` is a deliberate no. The service never normalizes one into the other.
//
// There is no `isActive`: the table does not have that column. `deletedAt` is the only mark the row
// carries and `investigation.isActive` is the real source of its visibility.
export interface InvestigationSourceDetail {
  investigationId: string;
  history: boolean | null;
  interviewVaccinatedPerson: boolean | null;
  interviewHealthWorker: boolean | null;
  vaccinationRecord: boolean | null;
  autopsyRecord: boolean | null;
  verbalAutopsyRecord: boolean | null;
  investigationReport: boolean | null;
  other: boolean | null;
  otherDescription: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  investigation: InvestigationParentRef;
}
