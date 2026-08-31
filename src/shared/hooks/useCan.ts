import { useCurrentUser } from '@/features/auth/api';
import { tokenStore } from '@/shared/api/tokenStore';
import { ROLE_LEVELS, getEffectiveLevel, type RoleName } from '@/shared/config/roles';

// UX, no seguridad (ARCHITECTURE.md §4.4, CONVENTIONS.md §11): oculta lo que el usuario no
// puede hacer para que no lo intente. El backend sigue siendo la única autoridad; un 403
// inesperado se maneja igual aunque "no debería pasar".
//
// Gatea en hasRefreshToken igual que <RequireAuth> (§3.4: "hay sesión" es refresh token Y
// ['user','me'] resuelto), para ser seguro por su cuenta si algo lo usa fuera del árbol de
// <RequireAuth> — sin eso, dispararía ['user','me'] y un refresh condenado a fallar.
export function useCan(minLevel: number | RoleName): boolean {
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user } = useCurrentUser({ enabled: hasRefreshToken });
  if (!user) {
    return false;
  }
  const requiredLevel = typeof minLevel === 'number' ? minLevel : ROLE_LEVELS[minLevel];
  return getEffectiveLevel(user.roles) >= requiredLevel;
}
