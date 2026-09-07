import { z } from 'zod';
import { ANSWER_OPTIONS, type AnswerOption } from '@/contracts/common';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const answerOptionSchema = z.enum(ANSWER_OPTIONS);

// One `useForm` for the three tables (SPEC FE12a §3.5) — the header's own `notes` and the two
// branches' each need their own free-text field, so the branch ones carry a prefix instead of
// colliding on the same RHF path. `caseId`, `notificationType` and `isActive` are derived and
// never editable (§3.5): they are not fields of this type at all, same reasoning as `caseId` in
// `ClassificationFormValues`.
export type NotificationFormValues = Omit<
  CreateNotificationInput,
  'caseId' | 'notificationType' | 'isActive'
> &
  Omit<CreateSevereNotificationInput, 'notificationId' | 'notes'> & {
    severeNotes: CreateSevereNotificationInput['notes'];
  } & Omit<CreateNonSevereNotificationInput, 'notificationId' | 'notes'> & {
    nonSevereNotes: CreateNonSevereNotificationInput['notes'];
  };

// Every field optional/nullable except `esaviDescription` — "sin él no hay fila que crear"
// (§3.5). This is also the shape `notificationCompleteSchema` extends: the base never rejects a
// value legitimately typed for a field the save button doesn't require yet.
const notificationBaseSchema = z.object({
  esaviDescription: z.string().trim().min(1),
  hasRelevantMedicalHistory: answerOptionSchema.nullable().optional(),
  takesMedication: answerOptionSchema.nullable().optional(),
  outcomeItemId: z.string().uuid().nullable().optional(),
  // Never `null` (§3.3: "el único booleano opcional sin `| null`") — while unanswered it simply
  // does not travel in the body (§3.5), which `undefined` already models without extra handling.
  requestInvestigation: z.boolean().optional(),
  deathDate: z.string().regex(isoDateRegex).nullable().optional(),
  autopsyRequested: z.boolean().nullable().optional(),
  verbalAutopsyPerformed: z.boolean().nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  hasPreviousEventHistory: answerOptionSchema.nullable().optional(),
  hasAllergyToOtherVaccines: answerOptionSchema.nullable().optional(),
  hasAllergyToMedications: answerOptionSchema.nullable().optional(),
  hasAllergyToPreviousSameVaccine: answerOptionSchema.nullable().optional(),
  hasPregnancyComplications: answerOptionSchema.nullable().optional(),
  pregnancyComplicationsDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  severeNotes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  vaccinationHealthFacilityId: z.string().uuid().nullable().optional(),
  vaccinationSiteItemId: z.string().uuid().nullable().optional(),
  // The only field of the repository with a declared length (§3.5, mirroring the DDL).
  vaccinationCenterAddress: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(250).nullable().optional(),
  ),
  vaccinationGeoLocationId: z.string().uuid().nullable().optional(),
  verifiedPhysicalDocument: z.boolean().nullable().optional(),
  verifiedElectronicRecord: z.boolean().nullable().optional(),
  verifiedVerbalReport: z.boolean().nullable().optional(),
  verifiedClinicalRecord: z.boolean().nullable().optional(),
  verifiedUnknown: z.boolean().nullable().optional(),
  verifiedOtherSource: z.boolean().nullable().optional(),
  otherSourceDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  nonSevereNotes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

// "Guardar" (§3.5): the only requirement is `esaviDescription`. Attached as the form's resolver —
// everything else is free to travel or not, `CaseWizardActionBar`'s pending-fields list is what
// tells the user what is still missing for "Completar etapa", not a blocked save button.
export const notificationSaveSchema = notificationBaseSchema;

// Never called, only type-checked — same technique as `_assertSchemaMatchesContract` in
// `features/classification/schemas.ts`.
function _assertSchemaMatchesContract(value: z.infer<typeof notificationSaveSchema>): NotificationFormValues {
  return value;
}
void _assertSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// The three conditional rules of §3.5 ("qué significa «limpiar» en cada una"), as pure
// predicates: each one is true exactly when the block's visibility and its value(s) agree — the
// block is shown and answered, or hidden and cleared to `null`. Any other combination is what a
// `PUT` would reject with the codes named next to each rule in §3.5, and it is also what
// `createNotificationCompleteSchema` below turns into a pending-fields issue.
// ---------------------------------------------------------------------------------------------

// Fallecimiento (3 campos): visible sólo con `outcome.value === 'DEATH'`. `verbalAutopsyPerformed`
// stays out of this predicate on purpose — §3.5 marks it optional even under death, so its value
// (or lack of one) never makes the block incoherent.
export function isDeathFieldsRequirementMet(
  isDeathOutcome: boolean,
  deathDate: string | null | undefined,
  autopsyRequested: boolean | null | undefined,
): boolean {
  if (isDeathOutcome) {
    return deathDate != null && autopsyRequested != null;
  }
  return deathDate == null && autopsyRequested == null;
}

// `pregnancyComplicationsDescription`: visible sólo con `hasPregnancyComplications === 'YES'`.
export function isPregnancyDescriptionRequirementMet(
  hasPregnancyComplications: AnswerOption | null | undefined,
  pregnancyComplicationsDescription: string | null | undefined,
): boolean {
  const trimmed = (pregnancyComplicationsDescription ?? '').trim();
  return hasPregnancyComplications === 'YES' ? trimmed.length > 0 : trimmed.length === 0;
}

// `otherSourceDescription`: visible sólo con `verifiedOtherSource === true`.
export function isOtherSourceDescriptionRequirementMet(
  verifiedOtherSource: boolean | null | undefined,
  otherSourceDescription: string | null | undefined,
): boolean {
  const trimmed = (otherSourceDescription ?? '').trim();
  return verifiedOtherSource === true ? trimmed.length > 0 : trimmed.length === 0;
}

// "Al menos una fuente de verificación" (§3.5, §6 "Los controles"): not one of the three
// conditional-visibility rules above — the six switches are always visible — but still a group
// requirement `notificationCompleteSchema` needs, so it lives here as the same kind of pure
// predicate.
export function hasAnyVerificationSource(values: {
  verifiedPhysicalDocument?: boolean | null;
  verifiedElectronicRecord?: boolean | null;
  verifiedVerbalReport?: boolean | null;
  verifiedClinicalRecord?: boolean | null;
  verifiedUnknown?: boolean | null;
  verifiedOtherSource?: boolean | null;
}): boolean {
  return [
    values.verifiedPhysicalDocument,
    values.verifiedElectronicRecord,
    values.verifiedVerbalReport,
    values.verifiedClinicalRecord,
    values.verifiedUnknown,
    values.verifiedOtherSource,
  ].some((value) => value === true);
}

export interface NotificationCompleteContext {
  notificationType: NotificationType;
  // Resolved from `outcomeItemId` against `catalogItem.value` (SPEC FE12a §6 "Los catálogos y la
  // edad") — never from `code`/`name`. Not a form field, so it travels as context, not a key of
  // `NotificationFormValues`.
  isDeathOutcome: boolean;
  // §7.4: only a woman of fertile age opens this gate. Also context, same reason.
  pregnancyGateOpen: boolean;
}

// "Completar etapa" (§3.5): everything `notificationSaveSchema` already checks, plus the
// unconditional "sí" fields of the three tables and the three conditional rules above, gated to
// whichever branch `notificationType` says is active — the other branch's fields are never
// required, they don't exist for this notification. `notificationType`, `isDeathOutcome` and
// `pregnancyGateOpen` are derived elsewhere in the wizard and passed in as context instead of
// smuggled into the form's own field set (§3.5: none of the three is an editable field).
export function createNotificationCompleteSchema({
  notificationType,
  isDeathOutcome,
  pregnancyGateOpen,
}: NotificationCompleteContext) {
  return notificationBaseSchema.superRefine((data, ctx) => {
    if (!data.hasRelevantMedicalHistory) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['hasRelevantMedicalHistory'] });
    }
    if (!data.takesMedication) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['takesMedication'] });
    }
    if (!data.outcomeItemId) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['outcomeItemId'] });
    }
    if (data.requestInvestigation === undefined) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['requestInvestigation'] });
    }
    if (!isDeathFieldsRequirementMet(isDeathOutcome, data.deathDate, data.autopsyRequested)) {
      ctx.addIssue({ code: 'custom', message: 'deathFieldsRequired', path: ['deathDate'] });
    }

    if (notificationType === 'SEVERE') {
      if (!data.hasPreviousEventHistory) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasPreviousEventHistory'] });
      }
      if (!data.hasAllergyToOtherVaccines) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasAllergyToOtherVaccines'] });
      }
      if (!data.hasAllergyToMedications) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasAllergyToMedications'] });
      }
      if (!data.hasAllergyToPreviousSameVaccine) {
        ctx.addIssue({
          code: 'custom',
          message: 'required',
          path: ['hasAllergyToPreviousSameVaccine'],
        });
      }
      if (pregnancyGateOpen && !data.hasPregnancyComplications) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasPregnancyComplications'] });
      }
      if (
        !isPregnancyDescriptionRequirementMet(
          data.hasPregnancyComplications,
          data.pregnancyComplicationsDescription,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'pregnancyDescriptionRequired',
          path: ['pregnancyComplicationsDescription'],
        });
      }
    }

    if (notificationType === 'NON_SEVERE') {
      if (!data.vaccinationHealthFacilityId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationHealthFacilityId'] });
      }
      if (!data.vaccinationSiteItemId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationSiteItemId'] });
      }
      if (!data.vaccinationGeoLocationId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationGeoLocationId'] });
      }
      if (!hasAnyVerificationSource(data)) {
        // Group-level error, no single field owns it — same technique as `criteria` in
        // `features/classification/schemas.ts`.
        ctx.addIssue({ code: 'custom', message: 'atLeastOneVerificationSource', path: ['verifiedAny'] });
      }
      if (
        !isOtherSourceDescriptionRequirementMet(data.verifiedOtherSource, data.otherSourceDescription)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'otherSourceDescriptionRequired',
          path: ['otherSourceDescription'],
        });
      }
    }
  });
}

// SPEC FE12a §3.5 "Errores del backend mapeados" — al campo, por entidad. `SEVNOT_*`/`NSEVNOT_*`
// share the same field for their `_REQUIRED` and `_NOT_ALLOWED` variants: both are the same
// coherence rule seen from either direction, and the user needs to look at the same input either
// way (`CASE-PROCESS.md`, corrected in el paso 1 de este spec).
export const notificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  NOTIFCN_001_OUTCOME_NOT_FOUND: 'outcomeItemId',
  NOTIFCN_004_OUTCOME_NOT_FOUND: 'outcomeItemId',
  NOTIFCN_001_DEATH_FIELDS_REQUIRED: 'deathDate',
  NOTIFCN_004_DEATH_FIELDS_REQUIRED: 'deathDate',
  // Not `deathDate`: what is wrong is the combination, and `outcomeItemId` is the field the user
  // just touched (§6 "Las decisiones tomadas y descartadas").
  NOTIFCN_004_DEATH_FIELDS_NOT_ALLOWED: 'outcomeItemId',
};

export const severeNotificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  SEVNOT_001_PREGNANCY_DESCRIPTION_REQUIRED: 'pregnancyComplicationsDescription',
  SEVNOT_004_PREGNANCY_DESCRIPTION_REQUIRED: 'pregnancyComplicationsDescription',
  SEVNOT_001_PREGNANCY_DESCRIPTION_NOT_ALLOWED: 'pregnancyComplicationsDescription',
  SEVNOT_004_PREGNANCY_DESCRIPTION_NOT_ALLOWED: 'pregnancyComplicationsDescription',
};

export const nonSevereNotificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_REQUIRED: 'otherSourceDescription',
  NSEVNOT_004_OTHER_SOURCE_DESCRIPTION_REQUIRED: 'otherSourceDescription',
  NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED: 'otherSourceDescription',
  NSEVNOT_004_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED: 'otherSourceDescription',
  NSEVNOT_001_HEALTH_FACILITY_NOT_FOUND: 'vaccinationHealthFacilityId',
  NSEVNOT_004_HEALTH_FACILITY_NOT_FOUND: 'vaccinationHealthFacilityId',
  NSEVNOT_001_VACCINATION_SITE_NOT_FOUND: 'vaccinationSiteItemId',
  NSEVNOT_004_VACCINATION_SITE_NOT_FOUND: 'vaccinationSiteItemId',
  NSEVNOT_001_GEOLOCATION_NOT_FOUND: 'vaccinationGeoLocationId',
  NSEVNOT_004_GEOLOCATION_NOT_FOUND: 'vaccinationGeoLocationId',
};
