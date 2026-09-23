// Origin: esavi-backend/src/models/appRole.model.ts, read through ESAVI-APPROLE-002A.
// The listing excludes sysDetails alone (appRole.service.ts:11), so the response also carries
// createdAt, updatedAt, deletedAt and appDetails. They are not declared here because FE20 only
// reads the catalog to fill a selector; administering appRole is SPEC FE21 and declares its own.
// Ordered level DESC, name ASC by the backend (appRole.service.ts:15).
export interface AppRole {
  roleId: string;
  code: string;
  name: string;
  description: string;
  level: number;
  isSystemRole: boolean;
  isActive: boolean;
}
