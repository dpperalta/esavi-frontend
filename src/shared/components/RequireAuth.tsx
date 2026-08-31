import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';

// Exige sesión, sin mirar el rol (SPEC FE01 §3.1). "Hay sesión" es hay refresh token Y
// ['user','me'] resolvió (§3.4) — sin refresh token no tiene sentido ni lanzar la query.
export function RequireAuth() {
  const location = useLocation();
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user, isLoading } = useCurrentUser({ enabled: hasRefreshToken });

  if (!hasRefreshToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isLoading) {
    // El estado de carga real del arranque del shell (§3.6) llega con providers.tsx (paso 9).
    return null;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
