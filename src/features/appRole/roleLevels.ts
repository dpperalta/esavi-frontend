import { ROLE_LEVELS } from '@/shared/config/roles';

// The role the backend refuses to retire, whatever the requester's level
// (appRole.service.ts, ROLES.SUPERADMIN). Compared against `code`, the only column with a
// UNIQUE constraint — never against `name`.
export const SUPERADMIN_ROLE_CODE = 'SUPERADMIN';

// The four levels the seed ships, as `{ 10: 'ANALYTICS', … }`. Their codes are not translated:
// they are the literal values of appRole.code that roleValidation.middleware.ts compares.
export const KNOWN_LEVEL_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ROLE_LEVELS).map(([name, level]) => [level, name]),
);

// `50 · ADMIN` when the number is one of the four, plain `60` when it is not. Never colour-coded
// (SPEC FE21 §3.7): a coloured badge without text says nothing to whoever cannot tell those
// colours apart.
export function formatRoleLevel(level: number): string {
  const known = KNOWN_LEVEL_NAMES[level];
  return known ? `${level} · ${known}` : String(level);
}
