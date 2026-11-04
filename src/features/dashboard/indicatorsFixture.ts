import type { DashboardIndicators } from '@/contracts/dashboard';

// Test-only payload of ESAVI-DASH-007 (F66 §3.3), shared by the dashboard and home tests so the
// shape is written once. Default: the backend's 30-day default ending 2026-11-03.
export function indicatorsFixture(overrides: Partial<DashboardIndicators> = {}): DashboardIndicators {
  return {
    period: { from: '2026-10-05', to: '2026-11-03', days: 30 },
    previousPeriod: { from: '2026-09-05', to: '2026-10-04', days: 30 },
    scope: { restricted: true, hasAssignments: true, geoLocationId: null },
    volume: {
      total: { current: 42, previous: 30 },
      byNotificationType: {
        SEVERE: { current: 8, previous: 5 },
        NON_SEVERE: { current: 30, previous: 22 },
        none: { current: 4, previous: 3 },
      },
    },
    severity: {
      classified: { current: 38, previous: 27 },
      serious: { current: 8, previous: 5 },
      unclassified: { current: 4, previous: 3 },
      criteria: {
        death: 1,
        disability: 0,
        congenitalAnomaly: 0,
        fetalDeath: 0,
        lifeThreatening: 2,
        hospitalization: 6,
        abortion: 0,
        otherCondition: 1,
      },
    },
    deaths: { total: { current: 1, previous: 0 }, autopsyRequested: 1, autopsyPerformed: 0 },
    timeliness: {
      withEventDate: 40,
      withoutEventDate: 2,
      medianDays: 3.5,
      onTime: 31,
      deadlineDays: 7,
    },
    closure: {
      closedCases: 12,
      medianDaysToClose: 21,
      stageMedianDays: {
        CLASSIFICATION: 1,
        NOTIFICATION: 4,
        INVESTIGATION: 10.5,
        FINAL_CLASSIFICATION: 5,
      },
    },
    causality: {
      withFinalClassification: 12,
      withoutFinalClassification: 30,
      categories: { A: 5, B: 3, C: 2, D: 1, UNCLASSIFIED: 1 },
      aSubcategories: { vaccineProduct: 3, qualityDeviation: 0, programmaticError: 1, stress: 2 },
    },
    ...overrides,
  };
}
