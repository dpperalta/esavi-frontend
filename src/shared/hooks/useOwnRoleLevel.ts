import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';
import { getEffectiveLevel } from '@/shared/config/roles';

// The requester's own level, the same number `useCan` compares against — exposed because two
// callers need the value itself and not a yes/no: the cap of `<RoleLevelField>` and the cap its
// Zod schema is built with (SPEC FE21 §3.5). It lives beside `useCan` and not in the feature
// because reading the session from `features/appRole/` would be a feature importing another
// feature (CONVENTIONS.md §3).
//
// UX, not security (ARCHITECTURE.md §4.4): the backend answers 403 all the same.
// Gates on hasRefreshToken exactly like `useCan`, so it is safe outside a <RequireAuth> tree.
export function useOwnRoleLevel(): number {
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user } = useCurrentUser({ enabled: hasRefreshToken });
  return user ? getEffectiveLevel(user.roles) : 0;
}
