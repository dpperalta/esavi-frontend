import type { DashboardEpiCurve, DashboardEpiWeek } from '@/contracts/dashboard';

function week(
  epiWeek: number,
  weekStart: string,
  serious: number,
  nonSerious: number,
  unclassified: number,
  partial = false,
): DashboardEpiWeek {
  return {
    label: `2026-SE${epiWeek}`,
    epiYear: 2026,
    epiWeek,
    weekStart,
    partial,
    serious,
    nonSerious,
    unclassified,
    total: serious + nonSerious + unclassified,
  };
}

// Test-only payload of ESAVI-DASH-008 (F67 §3.3) over the same period as indicatorsFixture, so the
// weekly totals add up to its volume.total.current (42) and its 8 / 30 / 4 split (SPEC FE36a §5).
// 2026-10-05 is a Monday and 2026-11-03 a Tuesday, so both edge weeks are partial.
export function epiCurveFixture(overrides: Partial<DashboardEpiCurve> = {}): DashboardEpiCurve {
  return {
    period: { from: '2026-10-05', to: '2026-11-03', days: 30 },
    scope: { restricted: true, hasAssignments: true, geoLocationId: null },
    weeks: [
      week(40, '2026-10-04', 1, 5, 0, true),
      week(41, '2026-10-11', 2, 8, 0),
      week(42, '2026-10-18', 3, 7, 1),
      week(43, '2026-10-25', 1, 6, 1),
      week(44, '2026-11-01', 1, 4, 2, true),
    ],
    ...overrides,
  };
}
