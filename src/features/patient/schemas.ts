import { z } from 'zod';
import type { CreatePatientInput } from '@/contracts/patient';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// `isActive` is never a form field: the wizard always creates an active patient, and toggling it
// is `ESAVI-PATIENT-005A`/`005B`, out of scope of this spec (SPEC FE10 §2).
export type PatientFormValues = Omit<CreatePatientInput, 'isActive'>;

export const createPatientSchema = z.object({
  names: z.string().trim().min(1).max(200),
  lastNames: z.string().trim().min(1).max(200),
  // Required by `createPatientValidator` even though the DDL allows it null (SPEC FE10 §3.5, the
  // caso testigo de §5.0): the "sin documento" checkbox fills this with a client-generated
  // `PROV-YYYYMMDD-XXXX` before submit — it never reaches the backend empty.
  documentNumber: z.string().trim().min(1).max(100),
  passportNumber: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  // `<DateField allowFuture={false}>` already refuses a future keystroke and disables future
  // calendar days — no client-side "not future" check is repeated here (same reasoning as
  // `esaviCase.filters` never re-checking what `DateField` itself already enforces).
  birthDate: z.string().regex(isoDateRegex).nullable().optional(),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().max(255).optional()),
  phoneNumber: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  // `<CatalogSelect emit="id">` and `<GeoLocationPicker>` emit `string | null`, never `''` — no
  // `emptyToUndefined` preprocessing needed for these two.
  sexItemId: z.string().uuid().nullable().optional(),
  residenceGeoLocationId: z.string().uuid().nullable().optional(),
  // `healthSystemCode` is deliberately absent (SPEC FE10 §3.5): it is never asked, and the
  // backend discards without error whatever arrives under that name.
});
export const updatePatientSchema = createPatientSchema.partial();

export type PatientUpdateFormValues = Partial<PatientFormValues>;

// Never called, only type-checked: whatever this schema parses out must be a valid
// `CreatePatientInput` (minus `isActive`) — the shape that actually reaches `client.post`/`.put`.
// If `CreatePatientInput` gains, loses or retypes a required field without a matching change
// above, this fails to compile. This is what "deriva su tipo de formulario de CreatePatientInput,
// no lo reescribe" (SPEC FE10 §3.3) means in practice — checked against the imported contract
// type instead of redefining it (CONVENTIONS.md §9), without collapsing every field to
// `ZodTypeAny` the way typing the schema's object literal as `Record<keyof T, ZodTypeAny>` would
// (that erasure is what broke `zodResolver`'s inference the first time this was tried). Only this
// direction is asserted: the schema deliberately never produces `null` for the plain-text optional
// fields (an unset `<Input>` collapses to `undefined`, not `null`), so the contract's wider
// `T | null` isn't — and doesn't need to be — fully representable the other way round.
function _assertSchemaMatchesContract(value: z.infer<typeof createPatientSchema>): PatientFormValues {
  return value;
}
void _assertSchemaMatchesContract;

// SPEC FE10 §3.5. `PATIENT_001_DOCUMENT_EXISTS` is deliberately absent: it is not a field error,
// it is the §3.6 finding-not-error flow (dispara -006, ofrece al titular). Only `PATIENT_004_...`
// maps to a field, with the manual-merge text of §2.
export const patientErrorFieldMap: Partial<Record<string, keyof PatientFormValues>> = {
  PATIENT_001_SEX_NOT_FOUND: 'sexItemId',
  PATIENT_004_SEX_NOT_FOUND: 'sexItemId',
  // `GEOLOC` here, `GEOLOCATION` in notifier's own map (SPEC FE10 §3.5) — the asymmetry is the
  // backend's, copied as it is, never deduced from the other.
  PATIENT_001_GEOLOC_NOT_FOUND: 'residenceGeoLocationId',
  PATIENT_004_GEOLOC_NOT_FOUND: 'residenceGeoLocationId',
  PATIENT_004_DOCUMENT_EXISTS: 'documentNumber',
};
