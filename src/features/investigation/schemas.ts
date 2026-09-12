import { z } from 'zod';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

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
