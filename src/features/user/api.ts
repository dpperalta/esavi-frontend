import type { CreateUserInput } from '@/contracts/user';
import type { UpdateUserInput, User, UserListRow } from '@/contracts/declared/user';
import { createResource } from '@/shared/api/createResource';

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
