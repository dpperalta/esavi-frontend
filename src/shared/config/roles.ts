// Mirror of esavi-backend/src/constants/roles.constants.ts. Fallback only: the real authority
// is role.level, which ESAVI-USER-007 already brings per role (ARCHITECTURE.md §4.4, CONVENTIONS.md §11).
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

// Exact mirror of validateUserRole in esavi-backend/src/middlewares/roleValidation.middleware.ts:16-22
// — Math.max over level, with ROLE_LEVELS[NAME] as fallback when level is null, and 0 when the
// name isn't in the constant either. A user with no roles gets 0.
export function getEffectiveLevel(roles: RoleWithLevel[]): number {
  return Math.max(
    0,
    ...roles.map((role) => role.level ?? ROLE_LEVELS[role.name.toUpperCase() as RoleName] ?? 0),
  );
}

function levelOf(role: RoleWithLevel): number {
  return role.level ?? ROLE_LEVELS[role.name.toUpperCase() as RoleName] ?? 0;
}

// The name of the role that produces getEffectiveLevel — for display (HomePage's "your role"),
// not for authorization. A user with two roles shows the higher one, same tie-break as the
// level calculation above.
export function getEffectiveRoleName(roles: RoleWithLevel[]): string | null {
  if (roles.length === 0) {
    return null;
  }
  return roles.reduce((best, role) => (levelOf(role) > levelOf(best) ? role : best)).name;
}
