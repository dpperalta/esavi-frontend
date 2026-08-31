import { Navigate, Outlet } from 'react-router-dom';
import { useCan } from '@/shared/hooks/useCan';
import type { RoleName } from '@/shared/config/roles';

interface RequireRoleProps {
  level: number | RoleName;
}

// Exige un nivel mínimo y presupone sesión (SPEC FE01 §3.1): se anida dentro de
// <RequireAuth>, que ya resolvió ['user','me'] antes de que esto monte. Este spec no lo usa
// en ninguna ruta todavía — el hito 2 lo necesita en sus seis entidades a la vez.
export function RequireRole({ level }: RequireRoleProps) {
  const can = useCan(level);

  if (!can) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
