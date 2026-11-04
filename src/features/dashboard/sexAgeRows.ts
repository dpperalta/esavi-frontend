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
