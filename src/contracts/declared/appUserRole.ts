// Origin: esavi-backend/src/services/appUserRole.service.ts, toAssignmentResponse.
// The response of ESAVI-USERROLE-002A is `{ count, user, rows }` — a `user` field no other
// listing of the inventory carries (appUserRole.service.ts:139-144), and a narrower user than
// ESAVI-USER-003's: USER_ATTRIBUTES is five columns and has no displayName, roles or lifecycle.
import type { UserRoleSummary } from '@/contracts/declared/user';

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
  user: {
    userId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  rows: UserRoleAssignment[];
}
