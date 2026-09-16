import { z } from 'zod';
import { ANSWER_OPTIONS, TERM_SOURCES, type AnswerOption } from '@/contracts/common';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';
import type { CreateInvestigationMedicalHistoryInput } from '@/contracts/investigationMedicalHistory';
import type { CreateInvestigationPregnancyConditionInput } from '@/contracts/investigationPregnancyCondition';
import type { CreateInvestigationClinicalEvaluationInput } from '@/contracts/investigationClinicalEvaluation';
import type { CreateEvaluationInstitutionInput } from '@/contracts/evaluationInstitution';
import type { CreateInvestigationDiagnosticInput } from '@/contracts/investigationDiagnostic';
import type { CreateInvestigationVaccinationContextInput } from '@/contracts/investigationVaccinationContext';

const answerOptionSchema = z.enum(ANSWER_OPTIONS);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// The Postgres `smallint` ceiling (SPEC FE13d §1.E) — no `CHECK` of the DDL covers it, only the
// column type does, so replicating it here is what turns a `40000` into a readable client-side
// rejection instead of a `500` from a Postgres overflow. Shared by the five counters of §J.
const SMALLINT_MAX = 32767;

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

// ---------------------------------------------------------------------------------------------
// G — Clinical evaluation, section C (SPEC FE13c §3.5 A). No column is required: the row is born
// from the empty `POST` on the section's reveal (§2), same idea as the header in §A and the
// medical history in §E. One schema covers both `001` and `004` — the form always sends the
// whole resulting state, never a partial body.
// ---------------------------------------------------------------------------------------------

export type InvestigationClinicalEvaluationFormValues = Omit<
  CreateInvestigationClinicalEvaluationInput,
  'investigationId'
>;

// The three flag/explanation pairs (§1.D), declared once so the rule is applied parametrized
// instead of written three times — mirrors `FLAG_EXPLANATION_PAIRS` in
// `investigationClinicalEvaluation.service.ts`. Each pair keeps its own message key: the three
// pairs are three different concepts, not one `{{field}}`-interpolated error.
const CLINICAL_EVALUATION_FLAG_PAIRS = [
  {
    flag: 'sourceOther',
    explanation: 'otherDescription',
    requiredKey: 'otherDescriptionRequired',
    notAllowedKey: 'otherDescriptionNotAllowed',
  },
  {
    flag: 'suspectedChildAbuse',
    explanation: 'childAbuseExplanation',
    requiredKey: 'childAbuseExplanationRequired',
    notAllowedKey: 'childAbuseExplanationNotAllowed',
  },
  {
    flag: 'suspectedDomesticViolence',
    explanation: 'domesticViolenceExplanation',
    requiredKey: 'domesticViolenceExplanationRequired',
    notAllowedKey: 'domesticViolenceExplanationNotAllowed',
  },
] as const;

// Same comparison `assertFlagExplanationPairs` runs in the service: `=== true` and never
// truthiness — over a nullable boolean, `false`, `null` and absent all close the pair the same
// way. The form always sends its whole resulting state, so there is no "travels with content"
// distinction to make on the client: a closed flag simply requires an empty explanation.
export function isFlagExplanationRequirementMet(
  flag: boolean | null | undefined,
  explanation: string | null | undefined,
): boolean {
  const trimmed = (explanation ?? '').trim();
  return flag === true ? trimmed.length > 0 : trimmed.length === 0;
}

// Declares the state of the three pairs instead of letting the `PUT` body depend on what the
// form happened to leave behind (§1.D, same criterion as `buildMedicalHistorySavePayload` above):
// with a pair closed, its explanation travels as explicit `null`, and the differential update
// skips the `UPDATE` if it was already empty.
export function buildClinicalEvaluationSavePayload(
  values: InvestigationClinicalEvaluationFormValues,
): InvestigationClinicalEvaluationFormValues {
  return {
    ...values,
    otherDescription: values.sourceOther === true ? values.otherDescription : null,
    childAbuseExplanation:
      values.suspectedChildAbuse === true ? values.childAbuseExplanation : null,
    domesticViolenceExplanation:
      values.suspectedDomesticViolence === true ? values.domesticViolenceExplanation : null,
  };
}

export const investigationClinicalEvaluationSaveSchema = z
  .object({
    // Does not gate anything that follows (§6 decision 9): the five sources below are always
    // visible, whatever this answers.
    receivedMedicalAttention: answerOptionSchema.nullable().optional(),
    sourceExam: z.boolean().nullable().optional(),
    sourceDocuments: z.boolean().nullable().optional(),
    sourceVerbalAutopsy: z.boolean().nullable().optional(),
    sourceOther: z.boolean().nullable().optional(),
    otherDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    suspectedChildAbuse: z.boolean().nullable().optional(),
    childAbuseExplanation: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    suspectedDomesticViolence: z.boolean().nullable().optional(),
    domesticViolenceExplanation: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    // `text`, not `varchar(n)` (§1.E) — no screen limit here, unlike the two encrypted fields of
    // `evaluationInstitutionSaveSchema` below, which DO need one.
    clinicalDetailsPersonName: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    familyClinicalDetails: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    completeClinicalSummary: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    signsAndSymptoms: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    otherSocialBackground: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    // All three evaluated in the same pass, never stopping at the first (§1.D): the backend cuts
    // at the first offender, so a body breaking two pairs would only ever surface the second one
    // on the following submit if the client stopped early too.
    for (const pair of CLINICAL_EVALUATION_FLAG_PAIRS) {
      if (!isFlagExplanationRequirementMet(data[pair.flag], data[pair.explanation])) {
        ctx.addIssue({
          code: 'custom',
          message: data[pair.flag] === true ? pair.requiredKey : pair.notAllowedKey,
          path: [pair.explanation],
        });
      }
    }
  });

function _assertInvestigationClinicalEvaluationSchemaMatchesContract(
  value: z.infer<typeof investigationClinicalEvaluationSaveSchema>,
): InvestigationClinicalEvaluationFormValues {
  return value;
}
void _assertInvestigationClinicalEvaluationSchemaMatchesContract;

// SPEC FE13c §3.5 A — anchored on the explanation, the field the message is actually about; the
// six codes carry the operation (`001`/`004`) as their prefix, same criterion as
// `medicalHistoryErrorFieldMap` above.
export const investigationClinicalEvaluationErrorFieldMap: Partial<
  Record<string, keyof InvestigationClinicalEvaluationFormValues>
> = {
  INVCLIEV_001_OTHER_DESCRIPTION_REQUIRED: 'otherDescription',
  INVCLIEV_004_OTHER_DESCRIPTION_REQUIRED: 'otherDescription',
  INVCLIEV_001_OTHER_DESCRIPTION_NOT_ALLOWED: 'otherDescription',
  INVCLIEV_004_OTHER_DESCRIPTION_NOT_ALLOWED: 'otherDescription',
  INVCLIEV_001_CHILD_ABUSE_EXPLANATION_REQUIRED: 'childAbuseExplanation',
  INVCLIEV_004_CHILD_ABUSE_EXPLANATION_REQUIRED: 'childAbuseExplanation',
  INVCLIEV_001_CHILD_ABUSE_EXPLANATION_NOT_ALLOWED: 'childAbuseExplanation',
  INVCLIEV_004_CHILD_ABUSE_EXPLANATION_NOT_ALLOWED: 'childAbuseExplanation',
  INVCLIEV_001_DOMESTIC_VIOLENCE_EXPLANATION_REQUIRED: 'domesticViolenceExplanation',
  INVCLIEV_004_DOMESTIC_VIOLENCE_EXPLANATION_REQUIRED: 'domesticViolenceExplanation',
  INVCLIEV_001_DOMESTIC_VIOLENCE_EXPLANATION_NOT_ALLOWED: 'domesticViolenceExplanation',
  INVCLIEV_004_DOMESTIC_VIOLENCE_EXPLANATION_NOT_ALLOWED: 'domesticViolenceExplanation',
};

// ---------------------------------------------------------------------------------------------
// H — Evaluation institution, section C.7 (SPEC FE13c §3.5 B). Create/edit dialog, a single
// schema for both operations, same shape as `teamMemberSaveSchema` above.
// ---------------------------------------------------------------------------------------------

export type EvaluationInstitutionFormValues = Omit<
  CreateEvaluationInstitutionInput,
  'investigationId' | 'isActive'
>;

// The 120 characters are NOT the `varchar(250)` copied from the DDL (§1.E, §6 decision 6): what
// has to fit inside the column's 250 bytes is the ciphertext, longer than its plain text. This
// number depends on how much the encryption scheme grows a string — if that scheme ever changes,
// this is the one place to update it (§7.B).
export const ENCRYPTED_FIELD_SCREEN_LIMIT = 120;

// The identification guard of `001`/`004` (§3.5 B): at least one of the two must end up with a
// value. Evaluated over the RESULTING state, same criterion as `assertIdentificationIsPresent` in
// `evaluationInstitution.service.ts` — the form always sends its whole state, so "resulting" here
// is simply "what the two fields hold right now".
export function isInstitutionIdentified(
  healthFacilityId: string | null | undefined,
  institutionName: string | null | undefined,
): boolean {
  return !!healthFacilityId || (institutionName ?? '').trim().length > 0;
}

export const evaluationInstitutionSaveSchema = z
  .object({
    // The pregunta C.7, por fila (§1.C, §6 decision 1) — never compared against `code` anywhere
    // in this schema or in the screen that consumes it.
    evaluationInstitutionTypeItemId: z.string().uuid().nullable().optional(),
    healthFacilityId: z.string().uuid().nullable().optional(),
    institutionName: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(250).nullable().optional(),
    ),
    // Cifrado. Contador visible en pantalla (§3.7) — el tope es `ENCRYPTED_FIELD_SCREEN_LIMIT`,
    // no el `varchar(250)` de la columna.
    personName: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(ENCRYPTED_FIELD_SCREEN_LIMIT).nullable().optional(),
    ),
    personContact: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(ENCRYPTED_FIELD_SCREEN_LIMIT).nullable().optional(),
    ),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isInstitutionIdentified(data.healthFacilityId, data.institutionName)) {
      // Anchored on both fields at once (§2): whoever looks at only the search select or only
      // the free-text name still has to see why the row can't save.
      ctx.addIssue({ code: 'custom', message: 'identificationRequired', path: ['healthFacilityId'] });
      ctx.addIssue({ code: 'custom', message: 'identificationRequired', path: ['institutionName'] });
    }
  });

function _assertEvaluationInstitutionSchemaMatchesContract(
  value: z.infer<typeof evaluationInstitutionSaveSchema>,
): EvaluationInstitutionFormValues {
  return value;
}
void _assertEvaluationInstitutionSchemaMatchesContract;

// SPEC FE13c §3.5 B. The `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` is deliberately not
// here: it names the missing ficha, not a field of this dialog, and gets its own screen state
// (§3.2, §4 paso 5) instead of a field to anchor on.
export const evaluationInstitutionErrorFieldMap: Partial<
  Record<string, keyof EvaluationInstitutionFormValues>
> = {
  EVALINST_001_IDENTIFICATION_REQUIRED: 'institutionName',
  EVALINST_004_IDENTIFICATION_REQUIRED: 'institutionName',
  EVALINST_001_ALREADY_EXISTS: 'healthFacilityId',
  EVALINST_004_ALREADY_EXISTS: 'healthFacilityId',
};

// ---------------------------------------------------------------------------------------------
// I — Diagnostic, section C.17 (SPEC FE13c §3.5 C). Create/edit dialog — the twin of
// `notificationEventSchema` above, minus `isMainEsavi`/`isOtherEsavi`: same term picker, same
// resolution against a clinical master, same three branches, a different table entirely (§1.F —
// nothing ties this list to step 4's events).
// ---------------------------------------------------------------------------------------------

export type InvestigationDiagnosticFormValues = Omit<
  CreateInvestigationDiagnosticInput,
  'investigationId' | 'isActive'
>;

// `diagnosticDate` carries no "not future" rule here (§3.5 C): same criterion as
// `investigationSaveSchema` above — the screen's `<DateField allowFuture={false}>` applies it.
// No cross-field rule exists for this entity: the three fixed dates of the investigation are
// deliberately NOT compared against `diagnosticDate` (§2, out of scope; §5.5.6 of
// `CASE-PROCESS.md`).
export const investigationDiagnosticSaveSchema = z.object({
  diagnosticName: z.string().trim().min(1).max(500),
  diagnosticCode: z.preprocess(emptyToUndefined, z.string().trim().max(100).nullable().optional()),
  source: z.enum(TERM_SOURCES).optional(),
  diagnosticDate: z.string().regex(isoDateRegex).nullable().optional(),
  // No default value (§6 decision 8): "presumptive" and "not stated" are not the same thing, and
  // preselecting the catalog's first item would turn every unreviewed diagnosis into one.
  diagnosticTypeItemId: z.string().uuid().nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

function _assertInvestigationDiagnosticSchemaMatchesContract(
  value: z.infer<typeof investigationDiagnosticSaveSchema>,
): InvestigationDiagnosticFormValues {
  return value;
}
void _assertInvestigationDiagnosticSchemaMatchesContract;

// SPEC FE13c §3.5 C. `INVDIAG_00X_DIAGTERM_NOT_FOUND` anchors on `diagnosticName` — the term
// picker is what produced the code that failed to resolve. `ALREADY_EXISTS` anchors there too:
// the message tells the investigator to edit the existing row instead of adding a new one (§2).
export const investigationDiagnosticErrorFieldMap: Partial<
  Record<string, keyof InvestigationDiagnosticFormValues>
> = {
  INVDIAG_001_DIAGTERM_NOT_FOUND: 'diagnosticName',
  INVDIAG_004_DIAGTERM_NOT_FOUND: 'diagnosticName',
  INVDIAG_001_ALREADY_EXISTS: 'diagnosticName',
  INVDIAG_004_ALREADY_EXISTS: 'diagnosticName',
  INVDIAG_001_INVALID_DIAGNOSTIC_TYPE: 'diagnosticTypeItemId',
  INVDIAG_004_INVALID_DIAGNOSTIC_TYPE: 'diagnosticTypeItemId',
};

// ---------------------------------------------------------------------------------------------
// J — Vaccination context and cluster, sections D and D1 (SPEC FE13d §3.5). One form for D.3–D.6
// and D1: no column is required, so a single schema covers both `001` (open, empty) and `004`,
// same idea as the header in §A and the medical history in §E.
// ---------------------------------------------------------------------------------------------

export type InvestigationVaccinationContextFormValues = Omit<
  CreateInvestigationVaccinationContextInput,
  'investigationId'
>;

// THE GATE, strict against `'YES'` and never a truthiness check (SPEC FE13d §1.A): `'NO'`,
// `'UNKNOWN'`, `'NOT_APPLICABLE'`, `'NO_ANSWER'` and `null` are all truthy strings (or absent) and
// would open the block by accident under `!!isCluster`. Mirrors `isClusterBlockOpen` in
// `investigationVaccinationContext.service.ts`.
export function isClusterBlockOpen(isCluster: AnswerOption | null | undefined): boolean {
  return isCluster === 'YES';
}

// THE VIAL RULE, read backwards on purpose (SPEC FE13d §1.A, §6 decision 3): it is the `'NO'` that
// requires the counter, not the `'YES'` — when not every case of the cluster shared the vial, the
// missing datum is how many DID. Mirrors `assertSharedVialRule`. A `0` satisfies the obligation,
// which is why this checks against `null`/`undefined` and never against truthiness.
export function isSameVialCountRequirementMet(
  clusterUsedSameVial: AnswerOption | null | undefined,
  clusterSameVialCount: number | null | undefined,
): boolean {
  if (clusterUsedSameVial !== 'NO') return true;
  return clusterSameVialCount !== null && clusterSameVialCount !== undefined;
}

// Declares the state of the block instead of letting the `PUT` body depend on what the form
// happened to omit (SPEC FE13d §3.5, same criterion as `buildMedicalHistorySavePayload` above):
// with the block closed, the four cluster columns travel as explicit `null`, so
// `CLUSTER_FIELDS_NOT_ALLOWED` can never come back — the form never constructs that state.
export function buildVaccinationContextSavePayload(
  values: InvestigationVaccinationContextFormValues,
): InvestigationVaccinationContextFormValues {
  if (isClusterBlockOpen(values.isCluster)) return values;
  return {
    ...values,
    clusterIdentificationNumber: null,
    clusterAdditionalCaseCount: null,
    clusterUsedSameVial: null,
    clusterSameVialCount: null,
  };
}

export const investigationVaccinationContextSaveSchema = z
  .object({
    momentItemId: z.string().uuid().nullable().optional(),
    multidoseItemId: z.string().uuid().nullable().optional(),
    vaccinatedPerVialCount: z.number().int().min(0).max(SMALLINT_MAX).nullable().optional(),
    // Etiqueta propia, paralela a la del vial (SPEC FE13d §6 decision 2) — no está en
    // `ESAVI-FORM.md`; la clave i18n lo declara en §3.8.
    vaccinatedPerBatchCount: z.number().int().min(0).max(SMALLINT_MAX).nullable().optional(),
    locations: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    isCluster: answerOptionSchema.nullable().optional(),
    clusterIdentificationNumber: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(100).nullable().optional(),
    ),
    clusterAdditionalCaseCount: z.number().int().min(0).max(SMALLINT_MAX).nullable().optional(),
    clusterUsedSameVial: answerOptionSchema.nullable().optional(),
    clusterSameVialCount: z.number().int().min(0).max(SMALLINT_MAX).nullable().optional(),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isSameVialCountRequirementMet(data.clusterUsedSameVial, data.clusterSameVialCount)) {
      ctx.addIssue({
        code: 'custom',
        message: 'sameVialCountRequired',
        path: ['clusterSameVialCount'],
      });
    }
  });

function _assertInvestigationVaccinationContextSchemaMatchesContract(
  value: z.infer<typeof investigationVaccinationContextSaveSchema>,
): InvestigationVaccinationContextFormValues {
  return value;
}
void _assertInvestigationVaccinationContextSchemaMatchesContract;

// SPEC FE13d §3.2, §3.5 — `MOMENT_NOT_FOUND`/`MULTIDOSE_NOT_FOUND` anchor on their own
// `<CatalogSelect>` despite sharing the same `vaccinationMoment` catalog (the whole point of the
// two distinct codes). `CLUSTER_SAME_VIAL_COUNT_REQUIRED` anchors on the counter the vial rule is
// actually about. `CLUSTER_FIELDS_NOT_ALLOWED` is deliberately not here: the client never
// constructs the state that produces it (§6 decision 3 above).
export const investigationVaccinationContextErrorFieldMap: Partial<
  Record<string, keyof InvestigationVaccinationContextFormValues>
> = {
  INVVACTX_001_MOMENT_NOT_FOUND: 'momentItemId',
  INVVACTX_004_MOMENT_NOT_FOUND: 'momentItemId',
  INVVACTX_001_MULTIDOSE_NOT_FOUND: 'multidoseItemId',
  INVVACTX_004_MULTIDOSE_NOT_FOUND: 'multidoseItemId',
  INVVACTX_001_CLUSTER_SAME_VIAL_COUNT_REQUIRED: 'clusterSameVialCount',
  INVVACTX_004_CLUSTER_SAME_VIAL_COUNT_REQUIRED: 'clusterSameVialCount',
};
