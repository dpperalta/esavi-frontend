import { z } from 'zod';

// Limits mirror esavi-backend's appRole.validator.ts:25-42 and the DDL (STRING(100),
// STRING(200), TEXT) — CONVENTIONS.md §8: derived from the backend's validators, not from what
// "seems reasonable". `description` has no maximum on either side.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// The cap is an argument and not a module constant because it is the requester's own level,
// read from the session: an ADMIN creates roles up to 50, a SUPERADMIN up to 100. Equal level
// stays allowed — the backend's guard is `data.level > requesterLevel` (appRole.service.ts:40),
// and demanding strictly less would leave level 50 to the SUPERADMIN alone.
//
// Capping here is user experience, not security (ARCHITECTURE.md §4.4): the backend answers
// 403 APPROLE_001_LEVEL_EXCEEDED all the same, and that response is still handled.
export function createAppRoleSchema(maxLevel: number) {
  return z.object({
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    // Coerced because the control is an <Input type="number">, whose value is a string.
    // An empty field becomes undefined rather than 0, so it fails as missing and not as valid.
    level: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(maxLevel)),
  });
}

// ESAVI-APPROLE-004 takes the same four fields, all optional (updateAppRoleValidator:40-53).
// The whole object still travels: the differential update is the backend's (CONVENTIONS.md §6.5).
export function updateAppRoleSchema(maxLevel: number) {
  return createAppRoleSchema(maxLevel).partial();
}

export type AppRoleFormValues = z.infer<ReturnType<typeof createAppRoleSchema>>;
