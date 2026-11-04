import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { z } from 'zod';

export const DASHBOARD_RANGES = ['7d', '30d', '90d', '365d'] as const;

// Mirrors DASHBOARD_MAX_PERIOD_DAYS in esavi-backend/src/constants/dashboard.constants.ts (F66 §3.5).
export const DASHBOARD_MAX_PERIOD_DAYS = 366;

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

// The regex alone lets `2026-02-30` through; the backend's `isDashboardIsoDate` round-trips the
// date and rejects it, so this does the same instead of sending a guaranteed 400.
function isCalendarDate(value: string): boolean {
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

const dashboardDateField = z.string().regex(isoDateRegex).refine(isCalendarDate);

// Inclusive count, same as `daysBetweenInclusive` in the backend's dashboardPeriod.helper.ts:
// 2026-01-01..2026-01-01 is one day, so 366 days is `to - from = 365`.
export function countPeriodDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
}

// A factory, not a constant: «`to` no futura» depends on today, and taking it as an argument
// keeps the URL parsing pure and testable (SPEC FE35 §4 step 1). Custom issues carry the full
// i18n key as `message`; native issues are already translated by shared/config/zodErrorMap.ts.
export function dashboardPeriodSchema(today: string) {
  return z
    .object({
      range: z.enum(DASHBOARD_RANGES).optional(),
      from: dashboardDateField.optional(),
      to: dashboardDateField.optional(),
      geoLocationId: z.string().uuid().optional(),
    })
    .superRefine(({ from, to }, ctx) => {
      if (from === undefined && to === undefined) return;
      // «Personalizado» needs both ends (SPEC FE35 §3.5); a half-custom period is never sent.
      for (const field of ['from', 'to'] as const) {
        if ((field === 'from' ? from : to) === undefined) {
          ctx.addIssue({ code: 'invalid_type', expected: 'string', input: undefined, path: [field] });
        }
      }
      if (from === undefined || to === undefined) return;

      // Lexicographic over YYYY-MM-DD, the comparison resolveDashboardPeriod runs on the backend.
      if (from > to) {
        ctx.addIssue({ code: 'custom', message: 'dashboard.period.errors.fromAfterTo', path: ['to'] });
        return;
      }
      if (to > today) {
        ctx.addIssue({ code: 'custom', message: 'dashboard.period.errors.futureTo', path: ['to'] });
        return;
      }
      if (countPeriodDays(from, to) > DASHBOARD_MAX_PERIOD_DAYS) {
        ctx.addIssue({ code: 'custom', message: 'dashboard.period.errors.tooLong', path: ['from'] });
      }
    });
}

export type DashboardPeriodFormValues = z.infer<ReturnType<typeof dashboardPeriodSchema>>;
