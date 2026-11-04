// An investigation without the group's record was never evaluated, so it stays out of the
// denominator (F67 §6, SPEC FE36b §3.5): `null` means «sin investigaciones con registro», never 0 %.
export function programmaticRate(
  count: number,
  investigated: number,
  withoutRecord: number,
): number | null {
  const withRecord = investigated - withoutRecord;
  return withRecord > 0 ? count / withRecord : null;
}
