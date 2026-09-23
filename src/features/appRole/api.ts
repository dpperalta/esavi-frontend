import type { CreateAppRoleInput } from '@/contracts/appRole';
import type { AppRole, UpdateAppRoleInput } from '@/contracts/declared/appRole';
import { createResource } from '@/shared/api/createResource';

// POST   /api/roles                ESAVI-APPROLE-001   ADMIN       create
// GET    /api/roles                ESAVI-APPROLE-002A  USER        listing, active only
// GET    /api/roles/admin          ESAVI-APPROLE-002B  ADMIN       listing, incl. retired
// GET    /api/roles/:id            ESAVI-APPROLE-003   USER        detail, carries activeUserCount
// PUT    /api/roles/:id            ESAVI-APPROLE-004   ADMIN       update
// DELETE /api/roles/:id            ESAVI-APPROLE-005A  ADMIN       retire
// PATCH  /api/roles/activate/:id   ESAVI-APPROLE-005B  SUPERADMIN  reactivate
//
// `AppRole` and not `AppRoleDetail` as the entity type: only the `003` carries activeUserCount,
// and it is read through `useAppRoleDetail` rather than `useOne` because it must stay dormant
// until the confirmation dialog opens (SPEC FE21 §3.4).
//
// No `staleTime`: this screen edits the catalog it lists, so every mutation invalidates it
// (SPEC FE21 §3.4). The 30-minute one stays in FE20's selector, which only reads.
export const appRoleResource = createResource<AppRole, CreateAppRoleInput, UpdateAppRoleInput>({
  key: 'appRole',
  path: 'roles',
  idField: 'roleId',
  inactiveMode: 'adminPath',
  adminPath: 'roles/admin',
});
