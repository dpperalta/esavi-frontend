import { z } from 'zod';
import type { CreateClassificationInput } from '@/contracts/classification';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// Replicated, not imported: `esavi-app` is two sibling repos, not a monorepo (CLAUDE.md), so
// `esavi-backend/src/helpers/severity.helper.ts` can't be `import`ed. This mirrors
// `findSeverityViolation` field for field (SPEC FE11 §3.5) — the risk of the two drifting apart
// is documented, not hidden (SPEC FE11 §7).
// Exported: `ClassificationStep` reuses both to compute `getPendingFields()` (SPEC FE11 §3.5)
// without a second implementation of "does any criterion read true".
export const SERIOUS_CRITERION_FIELDS = [
  'causedDeath',
  'causedDisability',
  'causedCongenitalAnomaly',
  'causedFetalDeath',
  'causedLifeThreatening',
  'causedHospitalization',
  'causedAbortion',
  'causedOtherCondition',
] as const;

export type SeverityCriterionField = (typeof SERIOUS_CRITERION_FIELDS)[number];

export function hasAnySeriousCriterion(data: Record<SeverityCriterionField, boolean | null>): boolean {
  return SERIOUS_CRITERION_FIELDS.some((field) => data[field] === true);
}

type SeverityCoherenceInput = Record<SeverityCriterionField, boolean | null> & {
  isSeriousEvent: boolean;
  otherSeriousConditionDescription?: string | null;
};

// The two violations a coherent form can still produce (SPEC FE11 §3.5). `SERIOUS_FLAG_REQUIRED`
// — the third row of `findSeverityViolation` — never reaches this refine: the compuerta is a
// required `z.boolean()` below, so an unanswered gate already fails as a native Zod issue before
// `.superRefine()` runs. Bare markers, resolved by the consumer against its own i18n key — same
// pattern as `esaviCaseFiltersSchema`'s `'rangeInvalid'` (features/esaviCase/schemas.ts).
function checkSeverityCoherence(data: SeverityCoherenceInput, ctx: z.RefinementCtx) {
  if (
    data.causedOtherCondition === true &&
    !String(data.otherSeriousConditionDescription ?? '').trim()
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'otherConditionDescriptionRequired',
      path: ['otherSeriousConditionDescription'],
    });
  }
  if (data.isSeriousEvent === true && !hasAnySeriousCriterion(data)) {
    // Group-level error: `criteria` is not a field of `CreateClassificationInput`, it's the
    // virtual RHF path `SeverityCriteriaGroup` reads to mark the whole group (SPEC FE11 §3.6).
    ctx.addIssue({ code: 'custom', message: 'atLeastOneCriterionRequired', path: ['criteria'] });
  }
}

// `saveSchema === completeSchema` (decision confirmed, SPEC FE11 §6): the backend declares no
// process-level blocker beyond the ones already here, so one schema serves both `save()` and
// "completar etapa".
//
// `caseId`, `isActive` and `notes` are not fields of this schema: `caseId` comes from the URL
// (never a form field, same reasoning as `patientId` in `CaseOpeningFormValues`), `isActive`
// isn't editable through this form, and `notes` is the deliberate scope exclusion of SPEC FE11 §2.
export const classificationSchema = z
  .object({
    isSeriousEvent: z.boolean(),
    causedDeath: z.boolean().nullable(),
    causedDisability: z.boolean().nullable(),
    causedCongenitalAnomaly: z.boolean().nullable(),
    causedFetalDeath: z.boolean().nullable(),
    causedLifeThreatening: z.boolean().nullable(),
    causedHospitalization: z.boolean().nullable(),
    causedAbortion: z.boolean().nullable(),
    causedOtherCondition: z.boolean().nullable(),
    otherSeriousConditionDescription: z.preprocess(
      emptyToUndefined,
      z.string().nullable().optional(),
    ),
    // `min 0, max 32767` (SPEC FE11 §3.5) — only asked when the age mode is editable; not sent
    // at all in read-only mode (ClassificationStep omits the field from the body, §3.5).
    age: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(32767).nullable().optional()),
    ageUnitItemId: z.string().uuid().nullable().optional(),
    // `<DateField allowFuture={false}>` already refuses a future keystroke — no client-side
    // "not future" check repeated here, same reasoning as `createEsaviCaseOpeningSchema`.
    firstConsultationDate: z.string().regex(isoDateRegex).nullable().optional(),
  })
  .superRefine(checkSeverityCoherence);

export type ClassificationFormValues = Omit<
  CreateClassificationInput,
  'caseId' | 'isActive' | 'notes'
>;

// Never called, only type-checked — same technique as `_assertSchemaMatchesContract` in
// `features/esaviCase/schemas.ts`.
function _assertSchemaMatchesContract(
  value: z.infer<typeof classificationSchema>,
): ClassificationFormValues {
  return value;
}
void _assertSchemaMatchesContract;

// SPEC FE11 §3.5. Sólo alcanzable en modo editable (con ambas fechas presentes el formulario ni
// pinta `ageUnitItemId`, §3.5) — el `op` viaja como `001` o `004` según venga de `POST` o `PUT`,
// pero el campo destino es el mismo en los dos casos.
export const classificationErrorFieldMap: Partial<Record<string, keyof ClassificationFormValues>> = {
  CLASSIF_001_AGEUNIT_NOT_FOUND: 'ageUnitItemId',
  CLASSIF_004_AGEUNIT_NOT_FOUND: 'ageUnitItemId',
};
