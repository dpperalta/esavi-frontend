import type { DashboardBatchAlert, DashboardBatchAlerts } from '@/contracts/dashboard';

// Test-only payload of ESAVI-DASH-010 (F68 §3.3) over the same period as indicatorsFixture,
// already ordered by severity as the backend returns it. Covers a death with expired doses and
// several spellings, a free-text vaccine whose key carries spaces, and a null label.
export function batchAlertFixture(
  overrides: Partial<DashboardBatchAlert> = {},
): DashboardBatchAlert {
  return {
    vaccineKey: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d01',
    label: 'Comirnaty',
    coded: true,
    batchNumber: 'AB123',
    variants: ['AB-123', 'AB 123', 'ab123'],
    cases: 5,
    suspectedCases: 4,
    serious: 2,
    deaths: 1,
    expiredAtVaccination: 2,
    firstReportDate: '2026-10-08',
    lastReportDate: '2026-10-30',
    facilities: 3,
    geoUnits: 2,
    expirationDates: ['2026-09-30'],
    reasons: ['MIN_CASES', 'MIN_SERIOUS', 'DEATH'],
    ...overrides,
  };
}

export function batchAlertsFixture(
  overrides: Partial<DashboardBatchAlerts> = {},
): DashboardBatchAlerts {
  return {
    period: { from: '2026-10-05', to: '2026-11-03', days: 30 },
    scope: { restricted: true, hasAssignments: true, geoLocationId: null },
    thresholds: { minCases: 3, minSerious: 2 },
    total: 3,
    batchesEvaluated: 18,
    casesWithoutBatch: 4,
    alerts: [
      batchAlertFixture(),
      batchAlertFixture({
        vaccineKey: 'T:vacuna antigripal estacional',
        label: 'vacuna antigripal estacional',
        coded: false,
        batchNumber: 'FLU2026',
        variants: ['FLU2026'],
        cases: 3,
        suspectedCases: 3,
        serious: 0,
        deaths: 0,
        expiredAtVaccination: 0,
        facilities: 1,
        geoUnits: 1,
        expirationDates: [],
        reasons: ['MIN_CASES'],
      }),
      batchAlertFixture({
        vaccineKey: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d03',
        label: null,
        batchNumber: 'X9',
        variants: ['X9'],
        cases: 2,
        suspectedCases: 2,
        serious: 2,
        deaths: 0,
        expiredAtVaccination: 0,
        facilities: 2,
        geoUnits: 1,
        expirationDates: ['2027-03-31'],
        reasons: ['MIN_SERIOUS'],
      }),
    ],
    ...overrides,
  };
}
