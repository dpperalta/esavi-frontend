import type { DashboardDistributions } from '@/contracts/dashboard';

// Test-only payload of ESAVI-DASH-009 (F67 §3.3) over the same period as indicatorsFixture, so the
// sexAge matrix adds up to its volume.total.current (42) (SPEC FE36b §5). Vaccines carry a free-text
// row, a null label and a long name; programmatic leaves 10 administration and 8 cold-chain records.
// Geography also adds up to 42: two mappable units, one without coordinates, `self` and
// `unlocated` (SPEC FE36c §4 step 2).
export function distributionsFixture(
  overrides: Partial<DashboardDistributions> = {},
): DashboardDistributions {
  return {
    period: { from: '2026-10-05', to: '2026-11-03', days: 30 },
    scope: { restricted: true, hasAssignments: true, geoLocationId: null },
    vaccines: {
      items: [
        {
          key: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d01',
          label: 'Comirnaty',
          coded: true,
          cases: 14,
          serious: 3,
        },
        {
          key: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d02',
          label: 'Vacuna antineumocócica conjugada 13-valente adsorbida',
          coded: true,
          cases: 9,
          serious: 2,
        },
        {
          key: 'T:INFLUENZA TETRAVALENTE',
          label: 'INFLUENZA TETRAVALENTE',
          coded: false,
          cases: 6,
          serious: 1,
        },
        {
          key: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d03',
          label: null,
          coded: true,
          cases: 2,
          serious: 0,
        },
      ],
      others: { cases: 5, serious: 1 },
      casesWithoutSuspectedVaccine: 7,
    },
    sexAge: {
      bands: [
        'LT_1Y',
        'Y1_17',
        'Y18_24',
        'Y25_49',
        'Y50_59',
        'Y60_69',
        'Y70_79',
        'Y80_PLUS',
        'UNKNOWN',
      ],
      sexes: ['FEMALE', 'MALE', 'UNKNOWN', 'NONE'],
      matrix: [
        [2, 1, 0, 0],
        [3, 2, 0, 0],
        [4, 2, 0, 0],
        [5, 3, 1, 0],
        [3, 2, 0, 0],
        [2, 3, 0, 0],
        [2, 1, 0, 0],
        [1, 1, 0, 0],
        [1, 1, 0, 2],
      ],
    },
    geography: {
      rows: [
        {
          geoLocationId: '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40',
          kind: 'unit',
          name: 'Pichincha',
          latitude: -0.18,
          longitude: -78.47,
          total: 18,
          serious: 4,
        },
        {
          geoLocationId: '5b2e4d6f-8a1c-4e3b-9d7f-1a2b3c4d5e6f',
          kind: 'unit',
          name: 'Guayas',
          latitude: -2.19,
          longitude: -79.89,
          total: 8,
          serious: 1,
        },
        {
          geoLocationId: '9c4a1e7b-2d3f-4b8a-a6c5-7e1d0f2b3a94',
          kind: 'unit',
          name: 'Galápagos',
          latitude: null,
          longitude: null,
          total: 4,
          serious: 0,
        },
        {
          geoLocationId: null,
          kind: 'self',
          name: null,
          latitude: null,
          longitude: null,
          total: 5,
          serious: 1,
        },
        {
          geoLocationId: null,
          kind: 'unlocated',
          name: null,
          latitude: null,
          longitude: null,
          total: 7,
          serious: 2,
        },
      ],
    },
    programmatic: {
      investigatedCases: 12,
      withoutAdministrationRecord: 2,
      withoutColdChainRecord: 4,
      administrationErrors: {
        prescriptionError: 1,
        contaminatedVaccine: 0,
        abnormalVaccineConditions: 0,
        preparationError: 2,
        handlingError: 1,
        improperAdministration: 1,
        anyError: 3,
      },
      coldChainFailures: {
        rangeDeviation: 2,
        procedureNotFollowed: 1,
        vaccineNotUsable: 0,
        diluentNotUsable: 0,
        partiallyReconstitutedVaccine: 0,
        otherObjectPresent: 0,
        anyFailure: 2,
      },
    },
    ...overrides,
  };
}
