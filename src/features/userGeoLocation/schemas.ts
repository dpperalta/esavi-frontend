import { format } from 'date-fns';
import { z } from 'zod';

// `validFrom` and `validTo` are `timestamptz`, unlike every date of the case file, which is
// `date` and travels as YYYY-MM-DD (CONVENTIONS.md §8). The picker still chooses a day — whoever
// assigns a territory thinks in days, and SPEC FE22 §3.5 keeps the time out of the interface — so
// the client composes the instant: the start of the chosen day for `validFrom`, its last
// millisecond for `validTo`. That is what makes "from the 1st to the 1st" a whole day instead of
// an empty range the CHECK (validTo > validFrom) would reject.
const ISO_WITH_OFFSET = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx";

function atDayBoundary(isoDay: string, boundary: 'start' | 'end'): Date {
  const [year, month, day] = isoDay.split('-').map(Number);
  // Built part by part on purpose: `new Date('2026-03-01')` is UTC midnight, which in a negative
  // offset lands on the previous day.
  return boundary === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);
}

export function composeValidFrom(isoDay: string): string {
  return format(atDayBoundary(isoDay, 'start'), ISO_WITH_OFFSET);
}

export function composeValidTo(isoDay: string): string {
  return format(atDayBoundary(isoDay, 'end'), ISO_WITH_OFFSET);
}

// The day the `<DateField>` primitive produces: YYYY-MM-DD, or null when the field is cleared.
const validityDayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

interface ValidityDays {
  validFrom: string | null;
  validTo: string | null;
}

// Compared as the composed instants and not as the two days, which is what lets the same day in
// both fields pass: as days it would read as an empty range, as instants it is 24 hours minus a
// millisecond. Compared by timestamp and not by the formatted strings, which are not ordered
// across an offset change. Saves a round trip only — the backend's 409 INVALID_DATE_RANGE is
// still handled (CONVENTIONS.md §8).
function checkValidityRange(data: ValidityDays, ctx: z.RefinementCtx) {
  if (!data.validFrom || !data.validTo) return;
  if (
    atDayBoundary(data.validTo, 'end').getTime() <= atDayBoundary(data.validFrom, 'start').getTime()
  ) {
    // Bare marker, resolved by the consumer against its own i18n key — same pattern as
    // `esaviCaseFiltersSchema`'s `'rangeInvalid'` (features/esaviCase/schemas.ts).
    ctx.addIssue({ code: 'custom', message: 'invalidDateRange', path: ['validTo'] });
  }
}

// ESAVI-USERGEO-007. `validFrom` and `validTo` apply to the WHOLE batch: the endpoint accepts
// them once, not per location, so different validities are two saves (SPEC FE22 §3.5).
export const bulkAssignGeoSchema = z
  .object({
    geoLocationIds: z
      .array(z.string().uuid())
      .min(1)
      // The backend's validator rejects a repeated id with 400, and the picker already prevents
      // it — this is the guard for the case the picker misses, not its replacement.
      .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicateLocation' }),
    validFrom: validityDayField,
    validTo: validityDayField,
  })
  .superRefine(checkValidityRange);

// ESAVI-USERGEO-004 accepts these two fields and nothing else: `userId` or `geoLocationId` in the
// body answer 400, and changing location is ESAVI-USERGEO-006.
export const updateGeoValiditySchema = z
  .object({
    validFrom: validityDayField,
    validTo: validityDayField,
  })
  .superRefine(checkValidityRange);

// ESAVI-USERGEO-006. One target location; the source travels in the URL.
export const reassignGeoSchema = z.object({
  geoLocationId: z.string().uuid(),
});

export type BulkAssignGeoFormValues = z.infer<typeof bulkAssignGeoSchema>;
export type UpdateGeoValidityFormValues = z.infer<typeof updateGeoValiditySchema>;
export type ReassignGeoFormValues = z.infer<typeof reassignGeoSchema>;

// SPEC FE22 §3.5. Only the codes that belong to a field of a form are here: the rest — the two
// ALREADY_INACTIVE, the ALREADY_ACTIVE and the 007's ASSIGNMENT_EXISTS — are shown as a toast,
// because they describe the state of a row and not a value someone typed.
export const bulkAssignGeoErrorFieldMap: Partial<Record<string, keyof BulkAssignGeoFormValues>> = {
  USERGEO_007_GEOLOC_NOT_FOUND: 'geoLocationIds',
  USERGEO_007_INVALID_DATE_RANGE: 'validTo',
};

export const updateGeoValidityErrorFieldMap: Partial<
  Record<string, keyof UpdateGeoValidityFormValues>
> = {
  USERGEO_004_INVALID_DATE_RANGE: 'validTo',
};

export const reassignGeoErrorFieldMap: Partial<Record<string, keyof ReassignGeoFormValues>> = {
  USERGEO_006_SAME_GEOLOCATION: 'geoLocationId',
  USERGEO_006_ASSIGNMENT_EXISTS: 'geoLocationId',
};
