import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';
import { ROLE_LEVELS, getEffectiveLevel, type RoleName } from '@/shared/config/roles';

// UX, not security (ARCHITECTURE.md §4.4, CONVENTIONS.md §11): hides what the user can't do
// so they don't try it. The backend remains the only authority; an unexpected 403 is handled
// the same way even though "it shouldn't happen".
//
// Gates on hasRefreshToken just like <RequireAuth> (§3.4: "there's a session" is refresh token
// AND ['user','me'] resolved), to be safe on its own if something uses it outside the
// <RequireAuth> tree — without this, it would fire ['user','me'] and a refresh doomed to fail.
export function useCan(minLevel: number | RoleName): boolean {
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user } = useCurrentUser({ enabled: hasRefreshToken });
  if (!user) {
    return false;
  }
  const requiredLevel = typeof minLevel === 'number' ? minLevel : ROLE_LEVELS[minLevel];
  return getEffectiveLevel(user.roles) >= requiredLevel;
}
