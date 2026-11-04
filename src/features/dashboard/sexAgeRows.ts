import type { DashboardDistributions } from '@/contracts/dashboard';

export interface SexAgeRow {
  band: string;
  female: number;
  male: number;
  unknown: number;
  none: number;
  unknownOrNone: number;
  total: number;
}

// Columns are looked up by their code in `sexes`, never by position: F67 guarantees the order,
// but a client that does not rely on it survives a reorder (SPEC FE36b §3.3).
export function sexAgeRows({
  bands,
  sexes,
  matrix,
}: DashboardDistributions['sexAge']): SexAgeRow[] {
  const column = (code: string) => sexes.indexOf(code);
  const femaleAt = column('FEMALE');
  const maleAt = column('MALE');
  const unknownAt = column('UNKNOWN');
  const noneAt = column('NONE');
  const read = (cells: number[] | undefined, at: number) => (at >= 0 ? (cells?.[at] ?? 0) : 0);

  return bands.map((band, bandAt) => {
    const cells = matrix[bandAt];
    const female = read(cells, femaleAt);
    const male = read(cells, maleAt);
    const unknown = read(cells, unknownAt);
    const none = read(cells, noneAt);
    return {
      band,
      female,
      male,
      unknown,
      none,
      unknownOrNone: unknown + none,
      total: female + male + unknown + none,
    };
  });
}

// Half-width of the pyramid's axis: the same on both sides, so neither sex looks larger only
// because of its scale (SPEC FE36b §6). At least 1, so an empty period still draws its axis.
export function pyramidMax(rows: SexAgeRow[]): number {
  return Math.max(1, ...rows.flatMap((row) => [row.female, row.male]));
}

// Symmetric integer ticks around 0; Recharts' own ticks over [-max, max] can come out lopsided
// once decimals are disallowed.
export function pyramidTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: max * 2 + 1 }, (_, index) => index - max);
  const half = Math.round(max / 2);
  return [-max, -half, 0, half, max];
}
