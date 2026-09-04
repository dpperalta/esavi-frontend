import { z } from 'zod';
import type { CreateNotifierInput } from '@/contracts/notifier';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// `caseId` comes from context — the current case — and is added by the caller when it builds the
// `POST` body; it is never a form field, and the `PUT` doesn't send it at all (SPEC FE10 §3.5:
// the service ignores it, moving a notifier between cases isn't offered). `isActive` isn't
// editable through this form either.
export type NotifierFormValues = Omit<CreateNotifierInput, 'caseId' | 'isActive'>;

export const createNotifierSchema = z.object({
  firstName: z.string().trim().min(2).max(150),
  // Required by the application although the DDL allows it null (SPEC FE10 §3.5, segundo caso de
  // validador ≠ DDL): a notifier identified by a given name alone identifies nobody.
  lastName: z.string().trim().min(2).max(150),
  professionItemId: z.string().uuid().nullable().optional(),
  geoLocationId: z.string().uuid().nullable().optional(),
  room: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  address: z.preprocess(emptyToUndefined, z.string().trim().max(250).optional()),
  phoneNumber: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  // No max declared (SPEC FE10 §3.5): the backend validator only runs `.isEmail()`.
  email: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  details: z.preprocess(emptyToUndefined, z.string().optional()),
});
export const updateNotifierSchema = createNotifierSchema.partial();

export type NotifierUpdateFormValues = Partial<NotifierFormValues>;

// Never called, only type-checked — same technique and same one-direction reasoning as
// `features/patient/schemas.ts`: whatever this schema parses out must be a valid
// `CreateNotifierInput` (minus `caseId`/`isActive`), checked against the imported contract type
// instead of redefining it (CONVENTIONS.md §9).
function _assertSchemaMatchesContract(value: z.infer<typeof createNotifierSchema>): NotifierFormValues {
  return value;
}
void _assertSchemaMatchesContract;

// SPEC FE10 §3.5. `NOTIFIER_001_CASE_NOT_FOUND` is deliberately absent: it's a toast, only
// reachable if the case was deactivated between the two writes — never a field of this form.
export const notifierErrorFieldMap: Partial<Record<string, keyof NotifierFormValues>> = {
  NOTIFIER_001_PROFESSION_NOT_FOUND: 'professionItemId',
  NOTIFIER_004_PROFESSION_NOT_FOUND: 'professionItemId',
  // `GEOLOCATION` here, `GEOLOC` in patient's own map — the asymmetry is the backend's, copied as
  // it is, never deduced from the other (SPEC FE10 §3.5, nota que evita un bug garantizado).
  NOTIFIER_001_GEOLOCATION_NOT_FOUND: 'geoLocationId',
  NOTIFIER_004_GEOLOCATION_NOT_FOUND: 'geoLocationId',
};
