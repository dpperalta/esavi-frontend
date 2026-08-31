// Espejo de esavi-backend/src/constants/roles.constants.ts. Sólo respaldo: la autoridad real
// es role.level, que ESAVI-USER-007 ya trae por rol (ARCHITECTURE.md §4.4, CONVENTIONS.md §11).
export const ROLE_LEVELS = {
  SUPERADMIN: 100,
  ADMIN: 50,
  USER: 25,
  ANALYTICS: 10,
} as const;

export type RoleName = keyof typeof ROLE_LEVELS;

interface RoleWithLevel {
  name: string;
  level?: number | null;
}

// Espejo exacto de validateUserRole en esavi-backend/src/middlewares/roleValidation.middleware.ts:16-22
// — Math.max sobre level, con ROLE_LEVELS[NAME] como respaldo cuando level es nulo, y 0 cuando
// tampoco el nombre está en la constante. Un usuario sin roles obtiene 0.
export function getEffectiveLevel(roles: RoleWithLevel[]): number {
  return Math.max(
    0,
    ...roles.map((role) => role.level ?? ROLE_LEVELS[role.name.toUpperCase() as RoleName] ?? 0),
  );
}
