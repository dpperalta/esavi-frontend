import { z } from 'zod';

// Limits mirror esavi-backend's geoLevelType.validator.ts (STRING(100), STRING(150)) —
// CONVENTIONS.md §8: derived from the backend's validators, not from what "seems reasonable".
export const createGeoLevelTypeSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  // SPEC FE04 §3.6: sortOrder is required, minimum 1 — unlike catalogType's minimum 0.
  sortOrder: z.coerce.number().int().min(1),
});

export const updateGeoLevelTypeSchema = createGeoLevelTypeSchema.partial();

export type GeoLevelTypeFormValues = z.infer<typeof createGeoLevelTypeSchema>;

// SPEC FE04 §3.6, hallazgo C — the real prefix the backend emits is `GEOTYPE_*`, not
// `GEOLVL_*` (the inventory's operation code). Mapping the "expectable" prefix produces a
// map that never fires.
export const geoLevelTypeErrorFieldMap: Partial<Record<string, keyof GeoLevelTypeFormValues>> = {
  GEOTYPE_001_CODE_EXISTS: 'code',
  GEOTYPE_004_CODE_EXISTS: 'code',
};
