import { z } from 'zod';

// Limits mirror esavi-backend's geoLocation.validator.ts and the DDL — CONVENTIONS.md §8:
// derived from the backend's validators, not from what "seems reasonable". `level` and
// `geoPolygon` are NOT form fields (SPEC FE04 §2, §3.6): the backend computes `level` from the
// parent and there's no map component for `geoPolygon`.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
// `GeoLocationPicker` emits `null` for "no parent chosen", never `''` — turned into `undefined`
// so an unset parent never travels in the `POST` body at all (JSON.stringify drops `undefined`
// keys, but keeps an explicit `null`).
const nullToUndefined = (value: unknown) => (value === null ? undefined : value);

export const createGeoLocationSchema = z.object({
  geoLevelTypeId: z.string().uuid(),
  parentGeoLocationId: z.preprocess(nullToUndefined, z.string().uuid().optional()),
  name: z.string().trim().min(1).max(150),
  // Required by createGeoLocationValidator (`notEmpty`), even though CreateGeoLocationInput
  // declares it optional (SPEC FE04 §7 riesgo) — the schema follows the validator.
  externalCode: z.string().trim().min(1).max(100),
  // No dedicated backend validator (SPEC FE04 §7 riesgo); the client replicates the model's
  // STRING(250) limit as its only guard.
  officialName: z.preprocess(emptyToUndefined, z.string().max(250).nullable().optional()),
  shortName: z.preprocess(emptyToUndefined, z.string().max(100).nullable().optional()),
  isoCode: z.preprocess(emptyToUndefined, z.string().max(10).nullable().optional()),
  latitude: z.preprocess(emptyToUndefined, z.coerce.number().min(-90).max(90).nullable().optional()),
  longitude: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(-180).max(180).nullable().optional(),
  ),
});

export const updateGeoLocationSchema = createGeoLocationSchema.partial();

export type GeoLocationFormValues = z.infer<typeof createGeoLocationSchema>;

// SPEC FE04 §3.6. `geoLevelType` codes are `GEOLOC_*`, matching the inventory's operation code
// (unlike geoLevelType's hallazgo C) — no prefix mismatch here.
export const geoLocationErrorFieldMap: Partial<Record<string, keyof GeoLocationFormValues>> = {
  GEOLOC_001_GEOLEVELTYPE_NOT_FOUND: 'geoLevelTypeId',
  GEOLOC_004_GEOLEVELTYPE_NOT_FOUND: 'geoLevelTypeId',
  GEOLOC_001_PARENT_GEOLOCATION_NOT_FOUND: 'parentGeoLocationId',
  GEOLOC_004_PARENT_GEOLOCATION_NOT_FOUND: 'parentGeoLocationId',
  GEOLOC_001_NAME_EXISTS: 'name',
  GEOLOC_004_NAME_EXISTS: 'name',
  GEOLOC_001_EXTERNAL_CODE_EXISTS: 'externalCode',
  GEOLOC_004_EXTERNAL_CODE_EXISTS: 'externalCode',
};

const MAX_GEO_IMPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// SPEC FE07 §3.5 — declared exception to CONVENTIONS.md §8: a File and a boolean aren't form
// fields, so there's no React Hook Form here, but the rule the section actually cares about
// (validation lives in a schema) still holds. Run with `safeParse` at file-pick time, both from
// the button and from the drop, never at submit. `issue.message` is a bare key fragment, the same
// pattern as `auth.passwordMismatch` (schemas.ts) — the component composes
// `geoBulkImport.upload.${message}` itself.
export const geoImportFileSchema = z
  .instanceof(File)
  .refine((file) => file.name.toLowerCase().endsWith('.xlsx'), { message: 'invalidExtension' })
  .refine((file) => file.size <= MAX_GEO_IMPORT_FILE_SIZE_BYTES, { message: 'tooLarge' });
