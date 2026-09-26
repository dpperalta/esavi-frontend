import { z } from 'zod';
import type { CreateVaccineWhodrugInput } from '@/contracts/vaccineWhodrug';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';

// `integer` column: the backend's `isInt()` has no bounds, so without this ceiling a larger value
// comes back as a 500 from Postgres (ARCHITECTURE.md §4.3, `<NumberField>`).
export const EXTERNAL_ID_MIN = -2147483648;
export const EXTERNAL_ID_MAX = 2147483647;

export const IS_GENERIC_OPTIONS = ['true', 'false', 'unknown'] as const;
export type IsGenericOption = (typeof IS_GENERIC_OPTIONS)[number];

// Limits mirror esavi-backend's vaccineWhodrug.validator.ts, which match the varchar widths of the
// DDL. `null` marks the `text` columns, which have no ceiling.
const OPTIONAL_TEXT_LIMITS = {
  drugRecNo: 50,
  drugRecNoSeq: 50,
  medicinalProductId: 250,
  atcs: 250,
  icd11: 250,
  icd11Term: 500,
  abbreviation: 250,
  ingredient: null,
  ingredientTranslation: null,
  noDose: null,
  diluent: null,
  language: 10,
  languageCode: 100,
  iso3Code: 250,
  countryMedicinalProductId: 250,
  maHolders: null,
  maHoldersMedicinalProductId: 250,
  form: null,
  formTranslations: null,
  formMedicinalProductId: 250,
  strength: null,
  strengthMedicinalProductId: 250,
  notes: null,
} as const;

export type VaccineWhodrugOptionalTextField = keyof typeof OPTIONAL_TEXT_LIMITS;

export const VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS = Object.keys(
  OPTIONAL_TEXT_LIMITS,
) as VaccineWhodrugOptionalTextField[];

function optionalText(max: number | null) {
  return max === null ? z.string().trim() : z.string().trim().max(max);
}

const optionalTextShape = Object.fromEntries(
  VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS.map((field) => [
    field,
    optionalText(OPTIONAL_TEXT_LIMITS[field]),
  ]),
) as Record<VaccineWhodrugOptionalTextField, z.ZodString>;

// SPEC FE25c §3.5. The form holds `''` for an empty text field and the three-state `isGeneric` as
// a string; `toVaccineWhodrugPayload` turns both into what the backend expects. No normalization
// help on `drugCode`/`drugName`: the backend stores them as typed, trimmed only (SPEC F18 §6).
export const createVaccineWhodrugSchema = z.object({
  drugCode: z.string().trim().min(1).max(250),
  drugName: z.string().trim().min(1),
  externalId: z.number().int().min(EXTERNAL_ID_MIN).max(EXTERNAL_ID_MAX).nullable(),
  isGeneric: z.enum(IS_GENERIC_OPTIONS),
  isPreferred: z.boolean(),
  ...optionalTextShape,
});

// The PUT carries the whole object and the backend computes the diff (CONVENTIONS.md §6.5), so
// both modes validate the same shape.
export const updateVaccineWhodrugSchema = createVaccineWhodrugSchema;

export type VaccineWhodrugFormValues = z.infer<typeof createVaccineWhodrugSchema>;

const EMPTY_OPTIONAL_TEXT = Object.fromEntries(
  VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS.map((field) => [field, '']),
) as Record<VaccineWhodrugOptionalTextField, string>;

// SPEC FE25c §3.4: on create, `isPreferred: false` and `isGeneric` unknown.
export const VACCINE_WHODRUG_DEFAULT_VALUES: VaccineWhodrugFormValues = {
  drugCode: '',
  drugName: '',
  externalId: null,
  isGeneric: 'unknown',
  isPreferred: false,
  ...EMPTY_OPTIONAL_TEXT,
};

function toIsGenericOption(isGeneric: boolean | null): IsGenericOption {
  if (isGeneric === null) return 'unknown';
  return isGeneric ? 'true' : 'false';
}

// What `reset()` receives when the 003 arrives: the form's inputs never hold `null`.
export function toVaccineWhodrugFormValues(detail: VaccineWhodrugDetail): VaccineWhodrugFormValues {
  const optionalText = Object.fromEntries(
    VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS.map((field) => [field, detail[field] ?? '']),
  ) as Record<VaccineWhodrugOptionalTextField, string>;

  return {
    drugCode: detail.drugCode ?? '',
    drugName: detail.drugName,
    externalId: detail.externalId,
    isGeneric: toIsGenericOption(detail.isGeneric),
    isPreferred: detail.isPreferred,
    ...optionalText,
  };
}

// SPEC FE25c §3.5. Every optional field travels, emptied as `null` — omitting a key would keep
// the stored value, `null` is how the backend empties the column. `isActive` never travels: it is
// not in the form, and 005A/005B own it.
export function toVaccineWhodrugPayload(values: VaccineWhodrugFormValues): CreateVaccineWhodrugInput {
  const optionalText = Object.fromEntries(
    VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS.map((field) => [
      field,
      values[field] === '' ? null : values[field],
    ]),
  ) as Record<VaccineWhodrugOptionalTextField, string | null>;

  return {
    drugCode: values.drugCode,
    drugName: values.drugName,
    externalId: values.externalId,
    isGeneric: values.isGeneric === 'unknown' ? null : values.isGeneric === 'true',
    isPreferred: values.isPreferred,
    ...optionalText,
  };
}

// SPEC FE25c §3.5. The `_NOT_FOUND`, `_ALREADY_INACTIVE` and `_ALREADY_ACTIVE` codes aren't here on
// purpose — they go to the page state or to the toast, not to a field.
export const vaccineWhodrugErrorFieldMap: Partial<Record<string, keyof VaccineWhodrugFormValues>> =
  {
    WHODRUG_001_EXTERNAL_ID_EXISTS: 'externalId',
    WHODRUG_004_EXTERNAL_ID_EXISTS: 'externalId',
  };

// The backend validator rejects an empty dictionaryVersion, so it is omitted from the multipart
// body when blank (importApi.ts) rather than sent as ''.
export const importVaccineWhodrugsSchema = z.object({
  dictionaryVersion: z.string().trim().max(100),
});

export type ImportVaccineWhodrugsFormValues = z.infer<typeof importVaccineWhodrugsSchema>;

export const IMPORT_DEFAULT_VALUES: ImportVaccineWhodrugsFormValues = { dictionaryVersion: '' };

export const MAX_VACCINE_WHODRUG_IMPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// Declared exception to CONVENTIONS.md §8, same as diagnosticTermImportFileSchema (SPEC FE25b
// §3.5): the File lives in component state (SPEC FE25c §3.4), not in React Hook Form. The issue
// message is the backend's own error code, so the component resolves it through the same
// `vaccineWhodrug.errors.*` key the server-side 413 lands on.
export const vaccineWhodrugImportFileSchema = z
  .instanceof(File, { message: 'WHODRUG_007_FILE_REQUIRED' })
  .refine((file) => file.size <= MAX_VACCINE_WHODRUG_IMPORT_FILE_SIZE_BYTES, {
    message: 'WHODRUG_007_FILE_TOO_LARGE',
  });

// SPEC FE25c §3.5. WHODRUG_007_IMPORT_FAILED is not here: it goes to a page-level alert.
export const vaccineWhodrugImportErrorFieldMap: Partial<Record<string, 'file'>> = {
  WHODRUG_007_FILE_REQUIRED: 'file',
  WHODRUG_007_FILE_TOO_LARGE: 'file',
  WHODRUG_007_FILE_INVALID: 'file',
};
