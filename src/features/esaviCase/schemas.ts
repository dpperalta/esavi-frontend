import { z } from 'zod';
import type { EsaviCaseListFilters } from '@/contracts/esaviCase';
import type { CaseWorkflowListFilters } from '@/contracts/caseWorkflow';

// Both schemas do the opposite of the usual job (SPEC FE09 §3.5): they don't validate what the
// user types, they validate what already travels in `searchParams`. A hand-edited, pasted or
// stale URL is not a validation error to show — it's noise to drop, silently, field by field
// (`.catch(undefined)`), the same way `express-validator` on the backend ignores an undeclared
// query param instead of 400ing on it.

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const uuidField = z.string().uuid().optional().catch(undefined);
const isoDateField = z.string().regex(isoDateRegex).optional().catch(undefined);
const pageField = z.coerce.number().int().min(1).optional().catch(undefined);
// Any value other than the literal string 'true' reads as false — a typo in a hand-edited URL
// (`includeInactive=1`) is noise like everything else here, not a reason to show inactive rows.
const includeInactiveField = z.string().optional().transform((value) => value === 'true');

const DATE_COLUMNS = ['reportDate', 'eventDate', 'reportFillingDate'] as const;

// The one rule the backend rejects with 400 that this schema still enforces (SPEC FE09 §3.5,
// rule 2): a real capture mistake, not URL noise. Lexicographic over YYYY-MM-DD, the same
// comparison `isNotEarlierThanItsFrom` runs in esaviCase.validator.ts — never a constructed
// `Date`. Rule 1 (exact + range on the same column) is not checked here: SPEC FE09 §3.5 makes it
// unreachable by construction in the filter UI (step 10), not something this schema screens for.
function checkDateRanges(data: Record<string, unknown>, ctx: z.RefinementCtx) {
  for (const column of DATE_COLUMNS) {
    const from = data[`${column}From`] as string | undefined;
    const to = data[`${column}To`] as string | undefined;
    if (from && to && from > to) {
      // Bare marker, resolved by the consumer against its own i18n key — same pattern as
      // `resetPasswordSchema`'s `'passwordMismatch'` (features/auth/schemas.ts).
      ctx.addIssue({ code: 'custom', message: 'rangeInvalid', path: [`${column}To`] });
    }
  }
}

// Parses `searchParams` for the «Por caso» tab into the fourteen filters of ESAVI-CASE-002A/002B
// (SPEC F48 + F52) plus `page` and `includeInactive`, the two other URL-only fields the tab needs
// (SPEC FE09 §3.4).
export const esaviCaseFiltersSchema = z
  .object({
    code: z.string().trim().min(2).max(200).optional().catch(undefined),
    patientId: uuidField,
    healthFacilityId: uuidField,
    geoLocationId: uuidField,
    reportDate: isoDateField,
    reportDateFrom: isoDateField,
    reportDateTo: isoDateField,
    eventDate: isoDateField,
    eventDateFrom: isoDateField,
    eventDateTo: isoDateField,
    reportFillingDate: isoDateField,
    reportFillingDateFrom: isoDateField,
    reportFillingDateTo: isoDateField,
    page: pageField,
    includeInactive: includeInactiveField,
  })
  .superRefine(checkDateRanges)
  .transform(({ page, includeInactive, ...filters }) => ({
    filters: filters as EsaviCaseListFilters,
    page: page ?? 1,
    includeInactive,
  }));

export type EsaviCaseFiltersResult = z.infer<typeof esaviCaseFiltersSchema>;

// Parses `searchParams` for the «Bandeja por estado» tab into the three filters of
// ESAVI-CASEFLOW-002A/002B plus `page` and `includeInactive`. No range rule: the backend runs no
// `openedFrom`/`openedTo` ordering cross-check (caseWorkflow.validator.ts) — unlike the three
// date columns of the case tab, an inverted pair here is left for the server's own read, not
// rejected client-side.
export const caseWorkflowFiltersSchema = z
  .object({
    statusCode: z.string().trim().optional().catch(undefined),
    openedFrom: isoDateField,
    openedTo: isoDateField,
    page: pageField,
    includeInactive: includeInactiveField,
  })
  .transform(({ page, includeInactive, ...filters }) => ({
    filters: filters as CaseWorkflowListFilters,
    page: page ?? 1,
    includeInactive,
  }));

export type CaseWorkflowFiltersResult = z.infer<typeof caseWorkflowFiltersSchema>;
