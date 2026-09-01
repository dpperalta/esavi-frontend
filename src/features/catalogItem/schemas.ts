import { z } from 'zod';

// Limits mirror esavi-backend's catalogItem.validator.ts and the DDL — SPEC FE03 §1 finding D:
// `name` is 250 here, not 200 like catalogType, and `value` is a whole field catalogType doesn't
// have. `sortOrder` tops at 32767 (`smallint`). `description` is `text`, no limit to replicate.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const createCatalogItemSchema = z.object({
  // Optional: an empty string never travels — the backend mints `code` from `name` when absent.
  code: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  name: z.string().trim().min(1).max(250),
  // Required in creation (SPEC FE03 §1 finding D). The backend normalizes it to CONSTANT_CASE;
  // shown back as it returns.
  value: z.string().trim().min(1).max(250),
  description: z.preprocess(emptyToUndefined, z.string().optional()),
  sortOrder: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(32767).optional()),
});

export type CatalogItemFormValues = z.infer<typeof createCatalogItemSchema>;

// `catalogTypeId` is never a schema field (SPEC FE03 §3.5): it comes from `searchParams.typeId`
// on create and never travels on update — moving an item to another type isn't offered here.
// `isActive`, `metadata` and `isValueLocked` aren't editable through this form either; they have
// their own `PATCH` or are out of scope (SPEC FE03 §2).
//
// `value` is omitted from the object entirely — not just made optional — when the row is
// `isValueLocked` (SPEC FE03 §3.6): with `zodResolver`, a key absent from the schema is stripped
// from the parsed output, so the PUT body never carries it. That's the difference between not
// sending what can't be saved and sending it and trusting the backend's silent 200 discard.
export function buildUpdateCatalogItemSchema(isValueLocked: boolean) {
  const { value, ...rest } = createCatalogItemSchema.shape;
  return z.object(isValueLocked ? rest : { ...rest, value }).partial();
}

// Named independently of `buildUpdateCatalogItemSchema`'s return (a boolean parameter makes its
// inferred type a union, awkward as a `ResourceForm` generic). `value` optional here covers both
// branches structurally: the locked branch's parsed object simply omits the key, which still
// satisfies an optional property.
export type CatalogItemUpdateFormValues = Partial<CatalogItemFormValues>;

// SPEC FE03 §3.5, hallazgo E: ceñido a los códigos que el backend emite de verdad.
// `CATITEM_001_CATTYPE_NOT_FOUND`/`004_CATTYPE_NOT_FOUND` no están aquí porque el tipo no es un
// campo del formulario — van al toast por `code`, igual que `_NOT_FOUND`, `_VALUE_LOCKED`,
// `_ALREADY_INACTIVE` y `_ALREADY_ACTIVE`.
export const catalogItemErrorFieldMap: Partial<Record<string, keyof CatalogItemFormValues>> = {
  CATITEM_001_CODE_EXISTS: 'code',
  CATITEM_004_CODE_EXISTS: 'code',
};
