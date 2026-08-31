import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';

// Requires a session, without looking at the role (SPEC FE01 §3.1). "There's a session" is
// there's a refresh token AND ['user','me'] resolved (§3.4) — without a refresh token it makes
// no sense to even fire the query.
export function RequireAuth() {
  const location = useLocation();
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user, isLoading } = useCurrentUser({ enabled: hasRefreshToken });

  if (!hasRefreshToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isLoading) {
    // The real loading state of the shell's startup (§3.6) arrives with providers.tsx (step 9).
    return null;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
