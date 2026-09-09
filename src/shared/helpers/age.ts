// Ported verbatim from `esavi-backend/src/helpers/age.helper.ts` (`resolveAgeAtEvent`), by
// explicit user decision on SPEC FE12d §4 paso 13: CASE-PROCESS.md §7.4 forbids reimplementing
// this arithmetic inside `src/features/notification/`, where the gate always reads a *stored*
// age from `['classification','byCase',caseId]`. But the block of paso 13 needs the age a
// *prospective* `birthDate`/`eventDate` would produce, before either is ever saved — no endpoint
// answers that question, so there is nothing to read. Keeping this a literal, cited port (same
// calendar-period arithmetic, same rounding) is what keeps the two from diverging exactly at the
// 15/49 boundary the spec calls out. Used only by `usePregnancyBlockGuard`, never by the gate
// itself.
export type AgeUnitCode = 'YEARS' | 'MONTHS' | 'DAYS';

export interface AgeAtEvent {
  age: number;
  unitCode: AgeUnitCode;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function toCalendarParts(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

// Completed calendar periods, never a division of milliseconds — that drifts a day on leap years
// and by 30 on every month that is not 30 days long, exactly at the borders a pregnancy-gate
// boundary review depends on. Returns `null` when either date is missing or the event precedes
// the birth: both are "nothing to block on", not an error this helper raises.
export function resolveAgeAtEvent(
  birthDate: string | null | undefined,
  eventDate: string | null | undefined,
): AgeAtEvent | null {
  const birth = toCalendarParts(birthDate);
  const event = toCalendarParts(eventDate);
  if (!birth || !event) return null;

  const birthUtc = Date.UTC(birth.year, birth.month - 1, birth.day);
  const eventUtc = Date.UTC(event.year, event.month - 1, event.day);
  if (eventUtc < birthUtc) return null;

  const completedMonths =
    (event.year - birth.year) * 12 + (event.month - birth.month) - (event.day < birth.day ? 1 : 0);

  if (completedMonths >= 12) {
    return { age: Math.floor(completedMonths / 12), unitCode: 'YEARS' };
  }
  if (completedMonths >= 1) {
    return { age: completedMonths, unitCode: 'MONTHS' };
  }
  return { age: Math.round((eventUtc - birthUtc) / MILLISECONDS_PER_DAY), unitCode: 'DAYS' };
}

// `resolvePregnancyGate` only understands years. A result in `MONTHS`/`DAYS` is, by definition,
// under one year old — well outside the 15–49 window — so it maps to `0`, a known age outside
// range, never to `null` ("unknown", which the gate treats as "show it to be safe").
export function ageInYearsForPregnancyGate(
  birthDate: string | null | undefined,
  eventDate: string | null | undefined,
): number | null {
  const result = resolveAgeAtEvent(birthDate, eventDate);
  if (!result) return null;
  return result.unitCode === 'YEARS' ? result.age : 0;
}
