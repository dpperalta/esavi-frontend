// Origin: esavi-backend/src/services/user.service.ts, toUserResponse / toUserListRow.
// The backend has no interface for the response: it is composed by deleting passwordHash,
// sysDetails and nameTokens from the model and decrypting the five PII columns
// (SPEC FE20 §3.3). The five arrive in clear text, but partial search over them is impossible.
import type { AppDetails } from '@/contracts/common';
import type { CreateUserInput } from '@/contracts/user';

// `through: { attributes: [] }` on ROLES_INCLUDE (user.service.ts:26-31), so no userRoleId
// travels here. ESAVI-USERROLE-002A is the only read that carries it, and 005A needs it.
export interface UserRoleSummary {
  roleId: string;
  name: string;
  code: string;
  level: number;
}

// Shape of ESAVI-USER-003 and of the rows of ESAVI-USER-008 — the search returns toUserResponse,
// not toUserListRow (user.service.ts:228-230), so its rows carry the audit trail too.
export interface User {
  userId: string;
  username: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  phone: string | null;
  requiresPasswordChange: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
  roles: UserRoleSummary[];
}

// Rows of ESAVI-USER-002A and -002B. toUserListRow deletes appDetails (user.service.ts:63-67):
// the audit history of every user multiplied by the page size makes the response unreadable.
// Whoever needs it reads the user through 003.
export type UserListRow = Omit<User, 'appDetails'>;

// ESAVI-USER-004 accepts five fields and only five: password, roleId, displayName, isActive and
// requiresPasswordChange answer 400 (updateUserValidator:60-82).
export type UpdateUserInput = Pick<
  CreateUserInput,
  'username' | 'email' | 'firstName' | 'lastName'
> & { phone?: string | null };
