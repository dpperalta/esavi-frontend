import { z } from 'zod';

// Limits mirror esavi-backend's catalogType.validator.ts and the DDL (STRING(100), STRING(200),
// STRING(500)) — CONVENTIONS.md §8: derived from the backend's validators, not from what "seems
// reasonable".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const createCatalogTypeSchema = z.object({
  // Optional: an empty string never travels — the backend mints `code` from `name` when it's
  // absent (SPEC FE02 §3.6).
  code: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  name: z.string().trim().min(1).max(200),
  description: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  sortOrder: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
});

export const updateCatalogTypeSchema = createCatalogTypeSchema.partial();

export type CatalogTypeFormValues = z.infer<typeof createCatalogTypeSchema>;

// SPEC FE02 §3.6. `CATTYPE_001_CODE_NOT_DERIVABLE`/`004` map to `name`, not `code`: the code is
// minted from the name, so it's the name that needs fixing. The rest (`_CREATION_FAILED`,
// `_UPDATE_FAILED`, `_NOT_FOUND`) aren't here on purpose — they go to the toast via
// `errorMessages.ts`, not to a field.
export const catalogTypeErrorFieldMap: Partial<Record<string, keyof CatalogTypeFormValues>> = {
  CATTYPE_001_CODE_EXISTS: 'code',
  CATTYPE_004_CODE_EXISTS: 'code',
  CATTYPE_001_CODE_NOT_VALID: 'code',
  CATTYPE_004_CODE_NOT_VALID: 'code',
  CATTYPE_001_CODE_NOT_DERIVABLE: 'name',
  CATTYPE_004_CODE_NOT_DERIVABLE: 'name',
};
