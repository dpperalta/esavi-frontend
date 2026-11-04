// The backend returns current and previous and leaves the change to the client (F66 §8): there
// is no correct percentage from zero, so 0→N is «new», not +∞ %.
export type IndicatorChange =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'up' | 'down'; ratio: number };

export function formatChange(current: number, previous: number): IndicatorChange {
  if (previous === 0) return current === 0 ? { kind: 'none' } : { kind: 'new' };
  if (current === previous) return { kind: 'none' };
  const ratio = Math.abs(current - previous) / previous;
  return { kind: current > previous ? 'up' : 'down', ratio };
}

export type IndicatorPointChange =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'pp'; points: number };

// A share is compared in percentage points (SPEC FE35 §3.6): «+5 pp» over a 10 % share, never
// «+50 %», which is a percentage of a percentage.
export function formatPointChange(
  currentShare: number | null,
  previousShare: number | null,
): IndicatorPointChange | null {
  if (currentShare === null) return null;
  if (previousShare === null) return { kind: 'new' };
  const points = (currentShare - previousShare) * 100;
  // Rounded to the one decimal shown, so 10.01 % vs 10 % reads «sin cambios», not «+0,0 pp».
  if (Math.round(points * 10) === 0) return { kind: 'none' };
  return { kind: 'pp', points };
}

// `null` when there is nothing classified to divide by: «sin casos clasificados», never NaN or 0 %.
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
