import { z } from 'zod';
import { ANSWER_OPTIONS, TERM_SOURCES, type AnswerOption } from '@/contracts/common';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';
import type { CreateInvestigationMedicalHistoryInput } from '@/contracts/investigationMedicalHistory';
import type { CreateInvestigationPregnancyConditionInput } from '@/contracts/investigationPregnancyCondition';

const answerOptionSchema = z.enum(ANSWER_OPTIONS);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// ---------------------------------------------------------------------------------------------
// A — Header (SPEC FE13a §3.5 A). No data column is required: the row is born from the empty
// `POST` on entering the step (§2), so "Guardar y continuar" never has anything to block on.
// `hospitalizationDate`/`investigationStartDate` don't carry the "not future" rule here — the
// screen's `<DateField allowFuture={false}>` applies it, same as the rest of the wizard.
// ---------------------------------------------------------------------------------------------

export type InvestigationFormValues = Omit<CreateInvestigationInput, 'caseId' | 'isActive'>;

export const investigationSaveSchema = z.object({
  statusItemId: z.string().uuid().nullable().optional(),
  vaccinationSiteItemId: z.string().uuid().nullable().optional(),
  vaccinationHealthFacilityId: z.string().uuid().nullable().optional(),
  vaccinationGeoLocationId: z.string().uuid().nullable().optional(),
  hospitalizationDate: z.string().regex(isoDateRegex).nullable().optional(),
  investigationStartDate: z.string().regex(isoDateRegex).nullable().optional(),
  // `numeric(10,7)` (§3.7): the range matches a real coordinate; `<MapPointPicker>` already
  // enforces the 7-decimal max on emit, so the schema doesn't repeat it.
  vaccinationLatitude: z.number().min(-90).max(90).nullable().optional(),
  vaccinationLongitude: z.number().min(-180).max(180).nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

// Never invoked, type-check only — same technique as `_assertSchemaMatchesContract` in
// `features/notification/schemas.ts`.
function _assertInvestigationSchemaMatchesContract(
  value: z.infer<typeof investigationSaveSchema>,
): InvestigationFormValues {
  return value;
}
void _assertInvestigationSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// B — Sources of information (SPEC FE13a §3.5 B). Eight tri-state flags (`null` = "not
// collected", `false` = a deliberate "no") plus the free text behind `other`.
// ---------------------------------------------------------------------------------------------

export type InvestigationSourceFormValues = Omit<CreateInvestigationSourceInput, 'investigationId'>;

// `otherDescription`: visible only when `other === true` — same signature as
// `isOtherSourceDescriptionRequirementMet` in `features/notification/schemas.ts`, a different entity.
export function isOtherSourceDescriptionRequirementMet(
  other: boolean | null | undefined,
  otherDescription: string | null | undefined,
): boolean {
  const trimmed = (otherDescription ?? '').trim();
  return other === true ? trimmed.length > 0 : trimmed.length === 0;
}

export const investigationSourceSaveSchema = z
  .object({
    history: z.boolean().nullable().optional(),
    interviewVaccinatedPerson: z.boolean().nullable().optional(),
    interviewHealthWorker: z.boolean().nullable().optional(),
    vaccinationRecord: z.boolean().nullable().optional(),
    autopsyRecord: z.boolean().nullable().optional(),
    verbalAutopsyRecord: z.boolean().nullable().optional(),
    investigationReport: z.boolean().nullable().optional(),
    other: z.boolean().nullable().optional(),
    otherDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isOtherSourceDescriptionRequirementMet(data.other, data.otherDescription)) {
      if (data.other === true) {
        ctx.addIssue({
          code: 'custom',
          message: 'otherDescriptionRequired',
          path: ['otherDescription'],
        });
      } else {
        ctx.addIssue({
          code: 'custom',
          message: 'otherDescriptionNotAllowed',
          path: ['otherDescription'],
        });
      }
    }
  });

function _assertInvestigationSourceSchemaMatchesContract(
  value: z.infer<typeof investigationSourceSaveSchema>,
): InvestigationSourceFormValues {
  return value;
}
void _assertInvestigationSourceSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// C — Autopsy (SPEC FE13a §3.5 C). Block 6.1–6.7, visible when `status.value === 'DEATH'`.
// `isDeath` always travels `true` and is never offered as a control; `deathDate` is required and
// **not nullable** — a single schema for create and update, like the rest of step 5's satellites.
// ---------------------------------------------------------------------------------------------

export type InvestigationAutopsyFormValues = Omit<CreateInvestigationAutopsyInput, 'investigationId'>;

// Rule 1 — `INVAUT_00X_AUTOPSY_FLAGS_EXCLUSIVE`: both can't be `true` at once.
export function areAutopsyFlagsMutuallyExclusive(
  isAutopsyPerformed: boolean | null | undefined,
  isAutopsyScheduled: boolean | null | undefined,
): boolean {
  return !(isAutopsyPerformed === true && isAutopsyScheduled === true);
}

// Rule 2 — `INVAUT_00X_AUTOPSY_DATE_NOT_ALLOWED`: forbidden without `isAutopsyPerformed === true`.
// With the flag `true` the date stays optional — there's no obligation the other way around.
export function isAutopsyDateRequirementMet(
  isAutopsyPerformed: boolean | null | undefined,
  autopsyDate: string | null | undefined,
): boolean {
  if (isAutopsyPerformed === true) return true;
  return !autopsyDate;
}

// Rule 3 — `INVAUT_00X_SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED`: exact mirror of rule 2, over
// `isAutopsyScheduled`/`scheduledAutopsyDate`.
export function isScheduledAutopsyDateRequirementMet(
  isAutopsyScheduled: boolean | null | undefined,
  scheduledAutopsyDate: string | null | undefined,
): boolean {
  if (isAutopsyScheduled === true) return true;
  return !scheduledAutopsyDate;
}

// Rule 4 — `INVAUT_00X_AUTOPSY_DATE_BEFORE_DEATH`: the only one of the four that can fire from a
// field that isn't its own (§3.5 C) — fixing only `deathDate` can leave a stale `autopsyDate`
// behind. Lexicographic comparison over `YYYY-MM-DD`, same as the rest of the repository. `null`
// on either side isn't a disagreement — nothing to compare.
export function isAutopsyDateNotBeforeDeath(
  autopsyDate: string | null | undefined,
  deathDate: string | null | undefined,
): boolean {
  if (!autopsyDate || !deathDate) return true;
  return autopsyDate >= deathDate;
}

export const investigationAutopsySaveSchema = z
  .object({
    isDeath: z.literal(true),
    deathDate: z.string().regex(isoDateRegex),
    deathTime: z.preprocess(emptyToUndefined, z.string().regex(timeRegex).nullable().optional()),
    isAutopsyPerformed: z.boolean().nullable().optional(),
    autopsyDate: z.string().regex(isoDateRegex).nullable().optional(),
    // No "not future" rule here (§3.5 C): unlike `autopsyDate`, an autopsy scheduled a few days
    // out is the normal case.
    isAutopsyScheduled: z.boolean().nullable().optional(),
    scheduledAutopsyDate: z.string().regex(isoDateRegex).nullable().optional(),
    autopsyComments: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!areAutopsyFlagsMutuallyExclusive(data.isAutopsyPerformed, data.isAutopsyScheduled)) {
      ctx.addIssue({
        code: 'custom',
        message: 'autopsyFlagsExclusive',
        path: ['isAutopsyScheduled'],
      });
    }
    if (!isAutopsyDateRequirementMet(data.isAutopsyPerformed, data.autopsyDate)) {
      ctx.addIssue({ code: 'custom', message: 'autopsyDateNotAllowed', path: ['autopsyDate'] });
    }
    if (!isScheduledAutopsyDateRequirementMet(data.isAutopsyScheduled, data.scheduledAutopsyDate)) {
      ctx.addIssue({
        code: 'custom',
        message: 'scheduledAutopsyDateNotAllowed',
        path: ['scheduledAutopsyDate'],
      });
    }
    if (!isAutopsyDateNotBeforeDeath(data.autopsyDate, data.deathDate)) {
      // Anchored on both dates at once (§3.5 C): whoever looks at only `deathDate` or only
      // `autopsyDate` still has to see the error.
      ctx.addIssue({ code: 'custom', message: 'autopsyDateBeforeDeath', path: ['deathDate'] });
      ctx.addIssue({ code: 'custom', message: 'autopsyDateBeforeDeath', path: ['autopsyDate'] });
    }
  });

function _assertInvestigationAutopsySchemaMatchesContract(
  value: z.infer<typeof investigationAutopsySaveSchema>,
): InvestigationAutopsyFormValues {
  return value;
}
void _assertInvestigationAutopsySchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// D — Team member (SPEC FE13a §3.5 D). Create/edit dialog, a single schema for both
// operations — `004` consumes the same `Partial<CreateInvestigationTeamMemberInput>`.
// ---------------------------------------------------------------------------------------------

export type TeamMemberFormValues = Omit<CreateInvestigationTeamMemberInput, 'investigationId'>;

export const teamMemberSaveSchema = z.object({
  fullName: z.string().trim().min(1).max(250),
  // Not normalized on the client (§3.5 D): `MINSAL` shouldn't come back as `Minsal`, and the
  // backend is the one that decides whether `fullName` is passed through Title Case.
  institutionName: z.preprocess(emptyToUndefined, z.string().trim().max(500).nullable().optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().nullable().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).nullable().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

function _assertTeamMemberSchemaMatchesContract(
  value: z.infer<typeof teamMemberSaveSchema>,
): TeamMemberFormValues {
  return value;
}
void _assertTeamMemberSchemaMatchesContract;

// SPEC FE13a §3.5 E — the duplicate is detected over normalized `fullName`, on both write
// operations (`API-ROUTES.md`: `001` create, `004` update).
export const teamMemberErrorFieldMap: Partial<Record<string, keyof TeamMemberFormValues>> = {
  INVTEAM_001_ALREADY_EXISTS: 'fullName',
  INVTEAM_004_ALREADY_EXISTS: 'fullName',
};

// ---------------------------------------------------------------------------------------------
// E — Medical history, sections B and B1 (SPEC FE13b §3.5 A). One form, one write: B and B1 are
// screen sections carved out by progressive disclosure, not two rows or two schemas — both save
// through the same `PUT`. No column is required (`investigationId` comes from context, same as
// the header in §A above), so a single schema covers both `001` (open, empty) and `004`.
// ---------------------------------------------------------------------------------------------

export type MedicalHistoryFormValues = Omit<CreateInvestigationMedicalHistoryInput, 'investigationId'>;

// The nine columns `isPregnancyConfirmed` governs (§3.5, the interior gate of §7.4). Strict
// against `'YES'` — never a truthy check — because the other four `AnswerOption` values
// (`'NO'`, `'UNKNOWN'`, `'NOT_APPLICABLE'`, `'NO_ANSWER'`) are truthy strings too and would open
// the block by accident.
export function isPregnancyBlockOpen(isPregnancyConfirmed: AnswerOption | null | undefined): boolean {
  return isPregnancyConfirmed === 'YES';
}

// Mirrors `hasContent` in `investigationMedicalHistory.service.ts:181-186`: `null` and the blank
// string are absence, and any number — `0` included — is content. `gestationalWeeks: 0` and
// `birthWeightGrams: 0` are real clinical values, not "nothing entered".
export function hasPregnancyFieldContent(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

// Declares the state of the block instead of letting the `PUT` body depend on what the form
// happened to omit (§3.5 point 3): with the block closed, the nine governed columns travel as
// explicit `null`, and the differential update skips the `UPDATE` if they were already empty.
export function buildMedicalHistorySavePayload(
  values: MedicalHistoryFormValues,
): MedicalHistoryFormValues {
  if (isPregnancyBlockOpen(values.isPregnancyConfirmed)) return values;
  return {
    ...values,
    gestationalWeeks: null,
    gestationMethodItemId: null,
    hasPregnancyRiskFactor: null,
    riskFactorDescription: null,
    deliveryItemId: null,
    birthItemId: null,
    birthWeightGrams: null,
    pregnancyOutcomeItemId: null,
    wasBreastfed: null,
  };
}

export const medicalHistorySaveSchema = z.object({
  hasPriorHospitalizationHistory: answerOptionSchema.nullable().optional(),
  priorHospitalizationObservations: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  hasFamilyHistory: answerOptionSchema.nullable().optional(),
  familyHistoryObservations: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  isPregnancyConfirmed: answerOptionSchema.nullable().optional(),
  // `esaviapp.sql:1045`'s `CHECK`, replicated: an integer between 0 and 45. `0` is valid.
  gestationalWeeks: z.number().int().min(0).max(45).nullable().optional(),
  gestationMethodItemId: z.string().uuid().nullable().optional(),
  hasPregnancyRiskFactor: answerOptionSchema.nullable().optional(),
  riskFactorDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  deliveryItemId: z.string().uuid().nullable().optional(),
  birthItemId: z.string().uuid().nullable().optional(),
  // `numeric(8,2)`, `isFloat` in the backend validator. `0` is valid.
  birthWeightGrams: z.number().min(0).max(6000).nullable().optional(),
  pregnancyOutcomeItemId: z.string().uuid().nullable().optional(),
  wasBreastfed: answerOptionSchema.nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

function _assertMedicalHistorySchemaMatchesContract(
  value: z.infer<typeof medicalHistorySaveSchema>,
): MedicalHistoryFormValues {
  return value;
}
void _assertMedicalHistorySchemaMatchesContract;

// SPEC FE13b §3.5 A — anchored by suffix, since the prefix carries the operation and the same
// error has a different code on `001` and on `004`.
export const medicalHistoryErrorFieldMap: Partial<Record<string, keyof MedicalHistoryFormValues>> = {
  INVMEDH_001_PREGNANCY_FIELDS_NOT_ALLOWED: 'isPregnancyConfirmed',
  INVMEDH_004_PREGNANCY_FIELDS_NOT_ALLOWED: 'isPregnancyConfirmed',
  INVMEDH_001_GESTATION_METHOD_NOT_FOUND: 'gestationMethodItemId',
  INVMEDH_004_GESTATION_METHOD_NOT_FOUND: 'gestationMethodItemId',
  INVMEDH_001_DELIVERY_NOT_FOUND: 'deliveryItemId',
  INVMEDH_004_DELIVERY_NOT_FOUND: 'deliveryItemId',
  INVMEDH_001_BIRTH_NOT_FOUND: 'birthItemId',
  INVMEDH_004_BIRTH_NOT_FOUND: 'birthItemId',
  INVMEDH_001_PREGNANCY_OUTCOME_NOT_FOUND: 'pregnancyOutcomeItemId',
  INVMEDH_004_PREGNANCY_OUTCOME_NOT_FOUND: 'pregnancyOutcomeItemId',
  // `001_ALREADY_EXISTS` and both `006_...NOT_FOUND` carry no field (§3.5 A): they're screen
  // states of their own — refresh and continue, or send back to the top of the step — not form
  // errors.
};

// ---------------------------------------------------------------------------------------------
// F — Newborn condition, section B2 (SPEC FE13b §3.5 B). Create/edit dialog for
// `investigationPregnancyCondition`, the same shape as `PregnancyComplicationFormDialog` minus
// the type `<CatalogSelect>` — same `<MeddraSearchField>`, same resolution, same three branches,
// but a different table: nothing preloads from step 4's complications into this one (§1).
// ---------------------------------------------------------------------------------------------

export type NewbornConditionFormValues = Omit<
  CreateInvestigationPregnancyConditionInput,
  'investigationId' | 'isActive'
>;

// `conditionName` is the only blocking field (§3.5 B); `conditionCode`/`source` are filled by the
// term picker's resolution, not typed directly.
export const newbornConditionSaveSchema = z.object({
  conditionName: z.string().trim().min(1).max(500),
  conditionCode: z.preprocess(emptyToUndefined, z.string().trim().max(100).nullable().optional()),
  source: z.enum(TERM_SOURCES).optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

function _assertNewbornConditionSchemaMatchesContract(
  value: z.infer<typeof newbornConditionSaveSchema>,
): NewbornConditionFormValues {
  return value;
}
void _assertNewbornConditionSchemaMatchesContract;

// SPEC FE13b §3.5 B. `INVPREG_00X_MEDICAL_HISTORY_NOT_FOUND` (404) is not here on purpose — same
// reasoning as `notificationPregnancyComplicationErrorFieldMap`'s missing `DIAGTERM_NOT_FOUND`
// branch: it has its own screen state (a "Crear la ficha" button), not a field to anchor on.
export const newbornConditionErrorFieldMap: Partial<Record<string, keyof NewbornConditionFormValues>> = {
  INVPREG_001_DIAGTERM_NOT_FOUND: 'conditionName',
  INVPREG_004_DIAGTERM_NOT_FOUND: 'conditionName',
  INVPREG_001_ALREADY_EXISTS: 'conditionName',
  INVPREG_004_ALREADY_EXISTS: 'conditionName',
};
