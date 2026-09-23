import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkAssignRolesInput } from '@/contracts/appUserRole';
import type { CreateUserInput } from '@/contracts/user';
import type { AppRole } from '@/contracts/declared/appRole';
import type { UserRoleAssignmentsResponse } from '@/contracts/declared/appUserRole';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { UpdateUserInput, User, UserListRow } from '@/contracts/declared/user';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// Every list this file reads whole rather than by page: the role catalog and a user's assignments
// are both a handful of rows, and the backend's DEFAULT_LIMIT of 10 would silently truncate them.
// A truncated page of assignments is not a display bug — the diff of §3.5 would read a role it
// never saw as missing and re-request it, and the `007` answers 409 for a pair already active.
const WHOLE_LIST_LIMIT = 100;

// The validator's minimum for `q`. Below it the `008` answers 400 USER_008_QUERY_REQUIRED, and
// that response is reserved for a `q` the backend cannot tokenize — never for a short one.
const SEARCH_MIN_LENGTH = 2;

// POST   /api/users               ESAVI-USER-001   ADMIN       create, roleId: string | string[]
// GET    /api/users               ESAVI-USER-002A  ADMIN       listing, active only
// GET    /api/users/admin         ESAVI-USER-002B  ADMIN       listing, incl. inactive
// GET    /api/users/:id           ESAVI-USER-003   ADMIN       detail
// PUT    /api/users/:id           ESAVI-USER-004   ADMIN       update, five fields
// DELETE /api/users/:id           ESAVI-USER-005A  ADMIN       deactivate
// PATCH  /api/users/activate/:id  ESAVI-USER-005B  SUPERADMIN  activate
//
// `UserListRow` is the fourth type parameter because `toUserListRow` deletes `appDetails` from
// the rows of 002A/002B (user.service.ts:63-67) while 003 keeps it: the audit sheet reads the
// user through `useOne`, never through a list row.
//
// No `staleTime`: the roster is not a catalog, and every mutation of this screen invalidates it.
export const userResource = createResource<User, CreateUserInput, UpdateUserInput, UserListRow>({
  key: 'user',
  path: 'users',
  idField: 'userId',
  inactiveMode: 'adminPath',
  adminPath: 'users/admin',
});

export interface UserSearchParams {
  page?: number;
  pageSize: number;
}

export function userRoleAssignmentsKey(userId: string) {
  return ['appUserRole', 'byUser', userId] as const;
}

// ESAVI-USER-008 — GET /api/users/search?q=… The five identifying columns are encrypted with a
// fixed IV, so `002A`/`002B` accept no text filter at all and this is the only way to find someone
// without paging the whole roster. One `q`, three OR branches resolved by the backend: whole name
// tokens, exact email, exact case-sensitive username (SPEC F62 §3.3). `createResource` knows
// nothing of a search route, so the hook lives beside the declaration.
export function useUserSearch(q: string, params: UserSearchParams) {
  const { page, pageSize } = params;
  const trimmed = q.trim();

  return useQuery({
    queryKey: ['user', 'search', { q: trimmed, page: page ?? 1, pageSize }],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<User>>('users/search', {
        params: { q: trimmed, limit: pageSize, offset: ((page ?? 1) - 1) * pageSize },
      });
      return response.data;
    },
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
  });
}

// ESAVI-USERROLE-002A — GET /api/user-roles/user/:id, the assignments in force. Asked for even
// though ESAVI-USER-003 already carries `roles`: its `ROLES_INCLUDE` uses
// `through: { attributes: [] }` (user.service.ts:26-31) and drops `userRoleId`, which is exactly
// what a revocation by `005A` addresses.
export function useUserRoleAssignments(userId: string) {
  return useQuery({
    queryKey: userRoleAssignmentsKey(userId),
    queryFn: async () => {
      const response = await client.get<UserRoleAssignmentsResponse>(`user-roles/user/${userId}`, {
        params: { limit: WHOLE_LIST_LIMIT, offset: 0 },
      });
      return response.data;
    },
    enabled: !!userId,
  });
}

// ESAVI-USERROLE-007 — POST /api/user-roles/bulk, all-or-nothing in one transaction, and it
// reactivates the pairs that existed revoked (appUserRole.service.ts:243-254) — which is why
// `005B` never needs to be consumed. Only the additions travel: a single pair already active
// answers 409 USERROLE_007_ASSIGNMENT_EXISTS and aborts the whole batch (:229-231).
export function useBulkAssignRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BulkAssignRolesInput) => {
      await client.post('user-roles/bulk', input);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userRoleAssignmentsKey(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: ['user', 'detail', variables.userId] });
    },
  });
}

// ESAVI-USERROLE-005A — DELETE /api/user-roles/:id, one assignment at a time: there is no bulk
// revocation in the inventory. `userId` travels alongside because the route identifies the
// assignment, not its owner, and the two queries to invalidate are keyed by the owner.
export function useRevokeUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userRoleId }: { userRoleId: string; userId: string }) => {
      await client.delete(`user-roles/${userRoleId}`);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userRoleAssignmentsKey(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: ['user', 'detail', variables.userId] });
    },
  });
}

// ESAVI-APPROLE-002A — GET /api/roles, active roles only: the selector never offers a role nobody
// can hold. Administering the catalog is SPEC FE21; here it is read as the catalog it is, with the
// 30-minute `staleTime` of CONVENTIONS.md §6.3.
export function useAppRoles() {
  return useQuery({
    queryKey: ['appRole', 'list'],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<AppRole>>('roles', {
        params: { limit: WHOLE_LIST_LIMIT, offset: 0 },
      });
      return response.data;
    },
    staleTime: 30 * 60 * 1000,
  });
}
