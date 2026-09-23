// Origin: esavi-backend/src/models/appRole.model.ts, read through ESAVI-APPROLE-002A/002B/003.
// The services exclude sysDetails alone (appRole.service.ts:11), so the response also carries
// createdAt, updatedAt, deletedAt and appDetails.
// Ordered level DESC, name ASC by the backend (appRole.service.ts:15).
import type { AppDetails } from '@/contracts/common';
import type { CreateAppRoleInput } from '@/contracts/appRole';

export interface AppRole {
  roleId: string;
  code: string;
  name: string;
  description: string;
  level: number;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// ESAVI-APPROLE-003 adds the count of users holding the role; no list row carries it, because
// it would be one query per row (SPEC FE21 §3.2).
export interface AppRoleDetail extends AppRole {
  activeUserCount: number;
}

// ESAVI-APPROLE-004 takes the same four fields, all optional. isSystemRole, isActive and roleId
// answer 400 in both 001 and 004 (updateAppRoleValidator).
export type UpdateAppRoleInput = Partial<CreateAppRoleInput>;
