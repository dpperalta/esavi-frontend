// NOT a mirror: the backend builds these two responses as literals, with no `interface` that
// `contracts:sync` could copy (SPEC FE01 §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// POST /api/auth/login (ESAVI-AUTH-001) — origin: esavi-backend/src/services/auth.service.ts:110-121
export interface LoginResponse {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    userId: string;
    email: string;
    displayName: string;
    // No `level`: the login response authorizes nothing (SPEC FE01 §1, finding A).
    // ['user', 'me'] / CurrentUser below is the only source of the effective level.
    roles: Array<{ roleId: string; name: string; code: string }>;
  };
}

// GET /api/users/me (ESAVI-USER-007) — origin: user.service.ts:54-59 (toUserResponse, over
// AppUser.toJSON() minus passwordHash and sysDetails) + :26-31 (ROLES_INCLUDE, with level).
// Model verified against esavi-backend/src/models/appUser.model.ts.
export interface CurrentUser {
  userId: string;
  username: string | null;
  email: string;
  externalProvider: string | null;
  externalSubject: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  requiresPasswordChange: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  roles: Array<{ roleId: string; name: string; code: string; level: number }>;
}
