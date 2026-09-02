import { z } from 'zod';

// Limits mirror esavi-backend's healthFacility.validator.ts, crossed with the DDL (SPEC FE06
// §3.7): the validator says 255 for `name`/`officialName`/`address`, but `healthFacility.model.ts`
// declares `STRING(250)` — the schema uses 250, the tighter of the two, so a 253-character value
// never gets past the client to fail at the database driver instead of a validation message.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const createHealthFacilitySchema = z.object({
  geoLocationId: z.string().uuid(),
  name: z.string().trim().min(1).max(250),
  // `<CatalogSelect>` and the parent `<Select>` emit `''` for "nothing chosen" (SPEC FE05 §3.1),
  // never `undefined` — preprocessed so an unset value never travels in the request body.
  facilityTypeItemId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  parentHealthFacilityId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  localCode: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  officialName: z.preprocess(emptyToUndefined, z.string().max(250).optional()),
  shortName: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  address: z.preprocess(emptyToUndefined, z.string().max(250).optional()),
  // Client-only range check (SPEC FE06 §3.7) — the backend only validates a decimal with up to
  // 7 places, no range.
  latitude: z.preprocess(emptyToUndefined, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(emptyToUndefined, z.coerce.number().min(-180).max(180).optional()),
  phone: z.preprocess(emptyToUndefined, z.string().max(50).optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().max(250).optional()),
});

// `isActive` is never a form field (SPEC FE06 §2): the lifecycle lives in `005A`/`005B`.
export const updateHealthFacilitySchema = createHealthFacilitySchema.partial();

export type HealthFacilityFormValues = z.infer<typeof createHealthFacilitySchema>;
export type HealthFacilityUpdateFormValues = Partial<HealthFacilityFormValues>;

// SPEC FE06 §3.7. `HFAC_004_SELF_PARENT`/`HFAC_004_CIRCULAR_PARENT` mark the same field as the
// FK-not-found codes: the backend does the cycle detection (hallazgo E), the client only routes
// the result to `parentHealthFacilityId`.
export const healthFacilityErrorFieldMap: Partial<
  Record<string, keyof HealthFacilityFormValues>
> = {
  HFAC_001_GEOLOCATION_NOT_FOUND: 'geoLocationId',
  HFAC_004_GEOLOCATION_NOT_FOUND: 'geoLocationId',
  HFAC_001_FACILITY_TYPE_NOT_FOUND: 'facilityTypeItemId',
  HFAC_004_FACILITY_TYPE_NOT_FOUND: 'facilityTypeItemId',
  HFAC_001_PARENT_HEALTH_FACILITY_NOT_FOUND: 'parentHealthFacilityId',
  HFAC_004_PARENT_HEALTH_FACILITY_NOT_FOUND: 'parentHealthFacilityId',
  HFAC_004_SELF_PARENT: 'parentHealthFacilityId',
  HFAC_004_CIRCULAR_PARENT: 'parentHealthFacilityId',
  HFAC_001_LOCAL_CODE_EXISTS: 'localCode',
  HFAC_004_LOCAL_CODE_EXISTS: 'localCode',
};
