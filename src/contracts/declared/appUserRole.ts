// Origin: esavi-backend/src/services/appUserRole.service.ts, toAssignmentResponse.
// The response of ESAVI-USERROLE-002A is `{ count, user, rows }` — a `user` field no other
// listing of the inventory carries (appUserRole.service.ts:139-144), and a narrower user than
// ESAVI-USER-003's: USER_ATTRIBUTES is five columns and has no displayName, roles or lifecycle.
import type { AppRole } from '@/contracts/declared/appRole';
import type { UserRoleSummary } from '@/contracts/declared/user';

// USER_ATTRIBUTES of appUserRole.service.ts:13, decrypted by toUserResponse. Named here because
// two responses of this file carry it: the owner of ESAVI-USERROLE-002A and, per row, the
// holders of ESAVI-USERROLE-006.
export interface AssignedUser {
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface UserRoleAssignment {
  userRoleId: string;
  userId: string;
  roleId: string;
  assignedByUserId: string | null;
  isActive: boolean;
  role: UserRoleSummary;
}

export interface UserRoleAssignmentsResponse {
  count: number;
  user: AssignedUser;
  rows: UserRoleAssignment[];
}

// ESAVI-USERROLE-006 mirrors 002A the other way round: `userInclude` replaces `roleInclude`
// (appUserRole.service.ts:272-296), so the role travels once outside the rows and every row
// carries its decrypted user. A row of this listing has no `role`, which is why it is a type of
// its own and not `UserRoleAssignment` (SPEC FE21 §3.3).
export interface RoleHolderAssignment {
  userRoleId: string;
  userId: string;
  roleId: string;
  assignedByUserId: string | null;
  isActive: boolean;
  user: AssignedUser;
}

export interface RoleHoldersResponse {
  count: number;
  role: Pick<AppRole, 'roleId' | 'code' | 'name' | 'level'>;
  rows: RoleHolderAssignment[];
}
