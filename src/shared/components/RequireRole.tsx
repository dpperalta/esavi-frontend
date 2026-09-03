import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';
import { ROLE_LEVELS, getEffectiveLevel, type RoleName } from '@/shared/config/roles';

interface RequireRoleProps {
  level: number | RoleName;
}

// Requires a minimum level and assumes a session exists (SPEC FE01 §3.1): nested inside
// <RequireAuth>, which already resolved ['user','me'] before this mounts — but a direct URL
// load or a refresh mounts both at once, and ['user','me'] has its own `isLoading` tick before
// that. SPEC FE07 §3.1 is the first route to gate on a level above USER, and hit this: without
// waiting here the same way <RequireAuth> does, an ADMIN loading /geo-locations/import fresh was
// bounced to "/" before the query resolved, then never got a second chance — the redirect had
// already replaced the URL, so <Outlet> stopped matching this route.
export function RequireRole({ level }: RequireRoleProps) {
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user, isLoading } = useCurrentUser({ enabled: hasRefreshToken });

  if (isLoading) {
    return null;
  }

  const requiredLevel = typeof level === 'number' ? level : ROLE_LEVELS[level];
  const can = !!user && getEffectiveLevel(user.roles) >= requiredLevel;

  if (!can) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
