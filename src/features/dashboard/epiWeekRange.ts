import { addDays, parseISO } from 'date-fns';

// The only week arithmetic on the client (SPEC FE36a §3.3): weeks, labels and `partial` come from
// the server, and the end date exists only to be shown. parseISO reads `YYYY-MM-DD` at local
// midnight, so the days shown are the days the backend counted.
export function epiWeekRange(weekStart: string, locale: string): { start: string; end: string } {
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const start = parseISO(weekStart);
  return { start: dateFormat.format(start), end: dateFormat.format(addDays(start, 6)) };
}
