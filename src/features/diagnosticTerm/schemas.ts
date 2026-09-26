import { z } from 'zod';
import { TERM_SOURCES } from '@/contracts/common';
import type { CreateDiagnosticTermInput } from '@/contracts/diagnosticTerm';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const IMPORT_ENCODINGS = ['utf8', 'latin1'] as const;

// Limits mirror esavi-backend's diagnosticTerm.validator.ts (SPEC F15, F17): `code` is required
// even though the DDL admits null, and `name` goes up to 500, not the 250 of the other catalogs.
export const createDiagnosticTermSchema = z.object({
  source: z.enum(TERM_SOURCES),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(500),
  termGroup: z.string().trim().max(250),
});

// `''` is "Sin marcar": the backend rejects an empty reviewStatus and has no operation that
// removes the key, so the unset value never travels (SPEC FE25b §3.5, §6).
export const updateDiagnosticTermSchema = createDiagnosticTermSchema.extend({
  reviewStatus: z.enum(['', ...REVIEW_STATUSES]),
});

export type CreateDiagnosticTermFormValues = z.infer<typeof createDiagnosticTermSchema>;
export type UpdateDiagnosticTermFormValues = z.infer<typeof updateDiagnosticTermSchema>;
// The one shape DiagnosticTermFormDialog's <ResourceForm> holds: create parses with
// createDiagnosticTermSchema (no reviewStatus), edit with updateDiagnosticTermSchema.
export type DiagnosticTermFormValues = CreateDiagnosticTermFormValues &
  Partial<Pick<UpdateDiagnosticTermFormValues, 'reviewStatus'>>;

// SPEC FE25b §3.5. On create, an empty termGroup is omitted; on update it travels as `null`,
// which is how the backend empties the column (omitting it would keep the old value). `source`
// never rides a PUT: the backend ignores it there, and a payload carrying an immutable field
// misleads whoever debugs it.
export function toDiagnosticTermPayload(
  values: CreateDiagnosticTermFormValues,
  mode: 'create',
): CreateDiagnosticTermInput;
export function toDiagnosticTermPayload(
  values: DiagnosticTermFormValues,
  mode: 'update',
): Partial<CreateDiagnosticTermInput>;
export function toDiagnosticTermPayload(
  values: DiagnosticTermFormValues,
  mode: 'create' | 'update',
): Partial<CreateDiagnosticTermInput> {
  if (mode === 'create') {
    return {
      source: values.source,
      code: values.code,
      name: values.name,
      ...(values.termGroup === '' ? {} : { termGroup: values.termGroup }),
    };
  }
  return {
    code: values.code,
    name: values.name,
    termGroup: values.termGroup === '' ? null : values.termGroup,
    ...(values.reviewStatus ? { reviewStatus: values.reviewStatus } : {}),
  };
}

// SPEC FE25b §3.5. The `_NOT_FOUND`, `_ALREADY_INACTIVE` and `_ALREADY_ACTIVE` codes aren't here on
// purpose — they go to the toast, not to a field.
export const diagnosticTermErrorFieldMap: Partial<Record<string, keyof DiagnosticTermFormValues>> =
  {
    DIAGTERM_001_CODE_EXISTS: 'code',
    DIAGTERM_004_CODE_EXISTS: 'code',
  };

// The backend validator rejects an empty termGroup or dictionaryVersion, so both are omitted from
// the multipart body when blank (importApi.ts) rather than sent as ''.
export const importDiagnosticTermsSchema = z.object({
  dictionaryVersion: z.string().trim().max(50),
  encoding: z.enum(IMPORT_ENCODINGS),
  source: z.enum(TERM_SOURCES),
  termGroup: z.string().trim().max(250),
});

export type ImportDiagnosticTermsFormValues = z.infer<typeof importDiagnosticTermsSchema>;

export const IMPORT_DEFAULT_VALUES: ImportDiagnosticTermsFormValues = {
  dictionaryVersion: '',
  encoding: 'utf8',
  source: 'MEDDRA',
  termGroup: 'LLT',
};

export const MAX_DIAGNOSTIC_TERM_IMPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// Declared exception to CONVENTIONS.md §8, same as geoImportFileSchema (SPEC FE07 §3.5): the File
// lives in component state (SPEC FE25b §3.4), not in React Hook Form, so it has its own schema.
// `issue.message` is the backend's own error code, so the component resolves it through the same
// `diagnosticTerm.errors.*` key the server-side 413 lands on.
export const diagnosticTermImportFileSchema = z
  .instanceof(File, { message: 'DIAGTERM_007_FILE_REQUIRED' })
  .refine((file) => file.size <= MAX_DIAGNOSTIC_TERM_IMPORT_FILE_SIZE_BYTES, {
    message: 'DIAGTERM_007_FILE_TOO_LARGE',
  });

// SPEC FE25b §3.5. DIAGTERM_007_IMPORT_FAILED is not here: it goes to a page-level alert.
export const diagnosticTermImportErrorFieldMap: Partial<Record<string, 'file'>> = {
  DIAGTERM_007_FILE_REQUIRED: 'file',
  DIAGTERM_007_FILE_TOO_LARGE: 'file',
  DIAGTERM_007_FILE_INVALID: 'file',
};
