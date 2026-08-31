import { Navigate, Outlet } from 'react-router-dom';
import { useCan } from '@/shared/hooks/useCan';
import type { RoleName } from '@/shared/config/roles';

interface RequireRoleProps {
  level: number | RoleName;
}

// Requires a minimum level and assumes a session exists (SPEC FE01 §3.1): nested inside
// <RequireAuth>, which already resolved ['user','me'] before this mounts. This spec doesn't
// use it on any route yet — milestone 2 needs it across its six entities at once.
export function RequireRole({ level }: RequireRoleProps) {
  const can = useCan(level);

  if (!can) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
