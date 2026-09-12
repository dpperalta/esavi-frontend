// NOT a mirror: the backend builds this response as a literal — `toInvestigationTeamMemberResponse`
// drops `sysDetails` off the Sequelize instance's `toJSON()`, so there is no `interface` for
// `contracts:sync` to copy (SPEC FE13a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-team-members/investigation/:id (002A), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationTeamMember.service.ts (MEMBER_EXCLUDE,
// INVESTIGATION_INCLUDE, toInvestigationTeamMemberResponse). The row operations and every row of
// the listings share this one shape; there is no reduced form.
//
// `fullName` comes back in Title Case — the backend normalizes it on write, so `ANA PÉREZ` is
// stored `Ana Pérez` and the list shows what was returned, not what was typed. `institutionName`
// is **not** normalized: `MINSAL` must not come back `Minsal`.
//
// `sortOrder` is assigned by the backend: the client neither sends it nor can change it, but it is
// what explains the order the listings come back in.
export interface InvestigationTeamMemberDetail {
  investigationTeamMemberId: string;
  investigationId: string;
  fullName: string;
  institutionName: string | null;
  email: string | null;
  phone: string | null;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  investigation: InvestigationParentRef;
}
