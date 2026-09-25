import { z } from 'zod';
import type { CreateDiluentInput } from '@/contracts/declared/diluent';

// Limits mirror esavi-backend's diluentCatalog.validator.ts (SPEC F23): `code` is required even
// though the DDL admits null, and the two text columns declare no ceiling.
export const createDiluentSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(250),
  description: z.string().trim(),
  composition: z.string().trim(),
});

export const updateDiluentSchema = createDiluentSchema.partial();

export type DiluentFormValues = z.infer<typeof createDiluentSchema>;

// An empty textarea travels as an explicit `null`, not as `''` nor as an omitted key: `null` is
// how the backend empties a nullable column, and omitting the key would leave the old value in
// place on a PUT (SPEC FE25a §3.5).
export function toDiluentPayload(values: DiluentFormValues): CreateDiluentInput {
  return {
    code: values.code,
    name: values.name,
    description: values.description === '' ? null : values.description,
    composition: values.composition === '' ? null : values.composition,
  };
}

// SPEC FE25a §3.5. The `_NOT_FOUND`, `_ALREADY_INACTIVE` and `_ALREADY_ACTIVE` codes aren't here on
// purpose — they go to the toast, not to a field.
export const diluentErrorFieldMap: Partial<Record<string, keyof DiluentFormValues>> = {
  DILUENT_001_CODE_EXISTS: 'code',
  DILUENT_004_CODE_EXISTS: 'code',
};
