import { useQuery } from '@tanstack/react-query';
import type { CreateAppRoleInput } from '@/contracts/appRole';
import type { AppRole, AppRoleDetail, UpdateAppRoleInput } from '@/contracts/declared/appRole';
import type { RoleHoldersResponse } from '@/contracts/declared/appUserRole';
import { client } from '@/shared/api/client';
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

// ESAVI-APPROLE-003 — GET /api/roles/:id. Same route and same cache key as the factory's
// `useOne`, but with a caller-controlled `enabled`: the count it exists for is asked when the
// retire dialog opens and never while the listing is merely on screen, because `activeUserCount`
// costs one COUNT over appUserRole per call (appRole.service.ts:126-128). Only this read carries
// it, which is why the response is `AppRoleDetail`.
export function useAppRoleDetail(roleId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['appRole', 'detail', roleId],
    queryFn: async () => {
      const response = await client.get<AppRoleDetail>(`roles/${roleId}`);
      return response.data;
    },
    enabled: enabled && !!roleId,
  });
}

export interface RoleHoldersParams {
  page?: number;
  pageSize: number;
}

export function roleHoldersKey(roleId: string, params: RoleHoldersParams) {
  return ['appUserRole', 'byRole', roleId, params] as const;
}

// ESAVI-USERROLE-006 — GET /api/user-roles/role/:id, who holds this role today. Keyed under
// `appUserRole` and not `appRole` because that is the entity it lists (CONVENTIONS.md §6.3);
// a mutation on a role therefore does not invalidate it, and none has to: retiring a role does
// not revoke its assignments.
export function useRoleHolders(roleId: string, params: RoleHoldersParams) {
  const { page, pageSize } = params;

  return useQuery({
    queryKey: roleHoldersKey(roleId, params),
    queryFn: async () => {
      const response = await client.get<RoleHoldersResponse>(`user-roles/role/${roleId}`, {
        params: { limit: pageSize, offset: ((page ?? 1) - 1) * pageSize },
      });
      return response.data;
    },
    enabled: !!roleId,
  });
}
