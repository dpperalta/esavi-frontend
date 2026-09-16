// NOT a mirror: the backend builds this response as a literal — `toInvestigationCommunityResponse`
// drops `sysDetails` (own and the nested investigation's) off the Sequelize instance's `toJSON()`,
// so there is no `interface` for `contracts:sync` to copy (SPEC FE13e §3.3). Reconciled by hand if
// the backend changes; `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';

// GET /api/investigation-communities/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationCommunity.service.ts (INVESTIGATION_INCLUDE,
// COMMUNITY_EXCLUDE, toInvestigationCommunityResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once, the same pattern as
// `investigationColdChain` and `investigationAdministrationError`.
//
// `patientLatitude` / `patientLongitude` come back as `number | null` even though pg hands numeric
// columns back as strings — the same treatment `investigationColdChain`'s declared type would give
// them, resolved by the client's numeric comparison in the differential helper (SPEC FE13e §3.3).
// These two are the only coordinates of the repository with a server-side range check (±90/±180).
export interface InvestigationCommunityDetail {
  investigationId: string;
  investigation: {
    investigationId: string;
    caseId: string;
    isActive: boolean;
  };
  patientLatitude: number | null;
  patientLongitude: number | null;
  hadSimilarEvent: AnswerOption | null;
  similarEventDescription: string | null;
  similarEventCount: number | null;
  affectedVaccinated: number | null;
  affectedUnvaccinated: number | null;
  affectedUnknown: number | null;
  otherComments: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}
