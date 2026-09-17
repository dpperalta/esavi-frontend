import { z } from 'zod';
import type { CreateFinalClassificationInput } from '@/contracts/finalClassification';
import type { FinalClassificationDetail } from '@/contracts/declared/finalClassification';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export type FinalClassificationFormValues = Omit<CreateFinalClassificationInput, 'caseId'>;

// The three precedence slots (SPEC FE14a §1C). Not three independent fields: the classifier ranks
// blocks A, B and C by strength of evidence, and no two slots may hold the same catalogItemId.
// Mirrors `IMPORTANCE_FIELDS` in `finalClassification.service.ts`.
export const IMPORTANCE_FIELDS = [
  'importanceAItemId',
  'importanceBItemId',
  'importanceCItemId',
] as const;

// The ten columns `dIsUnclassifiable === true` closes (SPEC FE14a §1C). Ten and not eleven: the
// flag itself is NOT in the list — it is the flag, not one of the fields it forbids. Mirrors
// `UNCLASSIFIABLE_FORBIDDEN_FIELDS` in `finalClassification.service.ts`.
export const UNCLASSIFIABLE_FORBIDDEN_FIELDS = [
  ...IMPORTANCE_FIELDS,
  'aIsRelatedToVaccineProduct',
  'aIsRelatedToQualityDeviation',
  'aIsRelatedToProgrammaticError',
  'aIsRelatedToStress',
  'bIsConsistentTemporalRelation',
  'bHasDeterminantFactor',
  'cHasCoincidentCause',
] as const;

// The seven booleans "Completar etapa" looks at (SPEC FE14a §3.5) — the ten forbidden fields minus
// the three importance slots, which don't count as a verdict on their own.
export const VERDICT_BOOLEAN_FIELDS = [
  'aIsRelatedToVaccineProduct',
  'aIsRelatedToQualityDeviation',
  'aIsRelatedToProgrammaticError',
  'aIsRelatedToStress',
  'bIsConsistentTemporalRelation',
  'bHasDeterminantFactor',
  'cHasCoincidentCause',
] as const;

// Rule 1 — `FINCLASS_00X_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED`: with D true, none of the ten forbidden
// fields may hold a value distinct from `null`. `false` is a value, not an absence — the same
// `!== undefined && !== null` criterion `assertUnclassifiableFieldsNotSent` uses server-side.
export function isUnclassifiableCoherent(
  data: Pick<
    FinalClassificationFormValues,
    (typeof UNCLASSIFIABLE_FORBIDDEN_FIELDS)[number] | 'dIsUnclassifiable'
  >,
): boolean {
  if (data.dIsUnclassifiable !== true) return true;
  return UNCLASSIFIABLE_FORBIDDEN_FIELDS.every(
    (field) => data[field] === null || data[field] === undefined,
  );
}

// Rule 2 — `FINCLASS_00X_IMPORTANCE_DUPLICATED`: the three slots cannot repeat a value between
// them. Only the informed ones are compared — the nulls take no part — mirrors
// `assertImportanceIsNotDuplicated` server-side. Returns the field names actually holding the
// duplicated value, so the caller anchors the error on the repeated slots, not on all three.
export function findDuplicatedImportanceFields(
  data: Pick<FinalClassificationFormValues, (typeof IMPORTANCE_FIELDS)[number]>,
): (typeof IMPORTANCE_FIELDS)[number][] {
  const counts = new Map<string, number>();
  for (const field of IMPORTANCE_FIELDS) {
    const value = data[field];
    if (value === null || value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return IMPORTANCE_FIELDS.filter((field) => {
    const value = data[field];
    return value !== null && value !== undefined && (counts.get(value) ?? 0) > 1;
  });
}

// "Completar etapa" (SPEC FE14a §3.5): a verdict exists with D true, or with at least one of the
// seven booleans of A, B and C true. Importances and `notes` don't count on their own.
export function hasVerdict(
  values: Pick<
    FinalClassificationFormValues,
    (typeof VERDICT_BOOLEAN_FIELDS)[number] | 'dIsUnclassifiable'
  >,
): boolean {
  if (values.dIsUnclassifiable === true) return true;
  return VERDICT_BOOLEAN_FIELDS.some((field) => values[field] === true);
}

function checkFinalClassificationCoherence(
  data: FinalClassificationFormValues,
  ctx: z.RefinementCtx,
) {
  if (!isUnclassifiableCoherent(data)) {
    ctx.addIssue({
      code: 'custom',
      message: 'unclassifiableFieldsNotAllowed',
      path: ['dIsUnclassifiable'],
    });
  }

  for (const field of findDuplicatedImportanceFields(data)) {
    ctx.addIssue({ code: 'custom', message: 'importanceDuplicated', path: [field] });
  }
}

// Guardar sólo exige `caseId`, que viene del contexto y no es un campo del formulario (SPEC FE14a
// §3.5): ningún control bloquea el guardado por sí solo, sólo la coherencia entre columnas.
export const finalClassificationSaveSchema = z
  .object({
    importanceAItemId: z.string().uuid().nullable().optional(),
    aIsRelatedToVaccineProduct: z.boolean().nullable().optional(),
    aIsRelatedToQualityDeviation: z.boolean().nullable().optional(),
    aIsRelatedToProgrammaticError: z.boolean().nullable().optional(),
    aIsRelatedToStress: z.boolean().nullable().optional(),
    importanceBItemId: z.string().uuid().nullable().optional(),
    bIsConsistentTemporalRelation: z.boolean().nullable().optional(),
    bHasDeterminantFactor: z.boolean().nullable().optional(),
    importanceCItemId: z.string().uuid().nullable().optional(),
    cHasCoincidentCause: z.boolean().nullable().optional(),
    dIsUnclassifiable: z.boolean().nullable().optional(),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine(checkFinalClassificationCoherence);

// Never invoked, type-check only — same technique as `_assertSchemaMatchesContract` in
// `features/classification/schemas.ts`.
function _assertFinalClassificationSchemaMatchesContract(
  value: z.infer<typeof finalClassificationSaveSchema>,
): FinalClassificationFormValues {
  return value;
}
void _assertFinalClassificationSchemaMatchesContract;

// The response carries the resolved `importanceA`/`importanceB`/`importanceC` objects, never the
// raw `importance*ItemId` (SPEC FE14a §3.3): this is the single point of mapping back to ids, and
// the eight booleans and `notes` travel through untouched, `null` included.
export function toFormValues(detail: FinalClassificationDetail): FinalClassificationFormValues {
  return {
    importanceAItemId: detail.importanceA?.catalogItemId ?? null,
    importanceBItemId: detail.importanceB?.catalogItemId ?? null,
    importanceCItemId: detail.importanceC?.catalogItemId ?? null,
    aIsRelatedToVaccineProduct: detail.aIsRelatedToVaccineProduct,
    aIsRelatedToQualityDeviation: detail.aIsRelatedToQualityDeviation,
    aIsRelatedToProgrammaticError: detail.aIsRelatedToProgrammaticError,
    aIsRelatedToStress: detail.aIsRelatedToStress,
    bIsConsistentTemporalRelation: detail.bIsConsistentTemporalRelation,
    bHasDeterminantFactor: detail.bHasDeterminantFactor,
    cHasCoincidentCause: detail.cHasCoincidentCause,
    dIsUnclassifiable: detail.dIsUnclassifiable,
    notes: detail.notes,
  };
}
