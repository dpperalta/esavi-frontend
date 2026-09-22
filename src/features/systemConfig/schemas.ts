import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// Mirrors `SystemConfigValueType` (contracts/systemConfig.ts) as a Zod enum — the five literals
// of `CK_systemConfig_valueType`, kept here as its own tuple because `z.enum` needs a literal
// tuple, not the widened `SystemConfigValueType[]` a type-annotated array would produce.
const SYSTEM_CONFIG_VALUE_TYPES = ['string', 'number', 'boolean', 'json', 'array'] as const;

// SPEC FE19 §3.5, "El editor de `value`": bare markers, resolved by the consumer against its own
// i18n key — same pattern as `classification/schemas.ts`'s `checkSeverityCoherence`. `json` and
// `array` hold their raw text in the form (the `<SystemConfigValueField>` textarea); `JSON.parse`
// only happens here, at validation time, never before.
function validateValueAgainstType(
  value: unknown,
  valueType: (typeof SYSTEM_CONFIG_VALUE_TYPES)[number],
  ctx: z.RefinementCtx,
) {
  switch (valueType) {
    case 'string':
      if (typeof value !== 'string' || value.trim().length === 0) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['value'] });
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['value'] });
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['value'] });
      }
      return;
    case 'json':
    case 'array': {
      if (typeof value !== 'string' || value.trim().length === 0) {
        ctx.addIssue({ code: 'custom', message: 'invalidJson', path: ['value'] });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'invalidJson', path: ['value'] });
        return;
      }
      if (valueType === 'array' && !Array.isArray(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'invalidArray', path: ['value'] });
      }
      return;
    }
  }
}

// The eight data columns of §3.5's table, minus `changeReason` — that one only exists on the
// update variant below, because the create form never shows it (SPEC FE19 §3.5: "no se muestra").
const systemConfigBaseSchema = z.object({
  code: z.string().trim().min(1).max(150),
  name: z.string().trim().min(1).max(200),
  description: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  scope: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  valueType: z.enum(SYSTEM_CONFIG_VALUE_TYPES).default('json'),
  // `unknown`, not a fixed primitive: which shape is valid depends on the sibling `valueType`
  // field, checked below in `.superRefine()` — same reasoning as the backend's own
  // `CreateSystemConfigInput.value` (contracts/systemConfig.ts).
  value: z.unknown(),
  isEncrypted: z.boolean().optional(),
  isEditable: z.boolean().optional(),
});

export const createSystemConfigSchema = systemConfigBaseSchema.superRefine((data, ctx) => {
  validateValueAgainstType(data.value, data.valueType, ctx);
});

export type SystemConfigFormValues = z.infer<typeof createSystemConfigSchema>;

// SPEC FE19 §3.5 — `changeReason` is required only when `value` actually changed. `valueChanged`
// is computed by the caller from `formState.dirtyFields.value` (`SystemConfigFormDialog`, SPEC
// FE19 §4 paso 5); this factory never inspects the payload to decide that for itself, same
// precedent as `createNotificationVaccineSchema({ eventDate })` taking its cross-field context as
// a parameter instead of reaching for it on its own.
export function createUpdateSystemConfigSchema({ valueChanged }: { valueChanged: boolean }) {
  return systemConfigBaseSchema
    .extend({
      changeReason: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    })
    .superRefine((data, ctx) => {
      validateValueAgainstType(data.value, data.valueType, ctx);
      if (valueChanged && !data.changeReason?.trim()) {
        ctx.addIssue({ code: 'custom', message: 'changeReasonRequired', path: ['changeReason'] });
      }
    });
}

export type SystemConfigUpdateFormValues = SystemConfigFormValues & {
  changeReason?: string | null;
};

// SPEC FE19 §3.5, "Errores del backend mapeados a campo".
export const systemConfigErrorFieldMap: Partial<
  Record<string, keyof SystemConfigUpdateFormValues>
> = {
  SYSCONF_001_CODE_EXISTS: 'code',
  SYSCONF_001_VALUE_TYPE_MISMATCH: 'value',
  SYSCONF_004_VALUE_TYPE_MISMATCH: 'value',
  SYSCONF_004_NOT_EDITABLE: 'isEditable',
  SYSCONF_004_CHANGE_REASON_REQUIRED: 'changeReason',
};
