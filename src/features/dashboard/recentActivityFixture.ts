import type { DashboardRecentActivity } from '@/contracts/dashboard';

// Test-only payload of ESAVI-DASH-011, shared by the dashboard and home tests so the shape is
// written once.
export function recentActivityFixture(
  overrides: Partial<DashboardRecentActivity> = {},
): DashboardRecentActivity {
  return {
    windowDays: 30,
    scope: { restricted: true, hasAssignments: true },
    territory: [
      {
        caseId: 'case-1',
        caseCode: 'ESAVI-0001',
        occurredAt: '2026-11-04T11:00:00.000Z',
        method: 'ESAVI-CASEFLOW-007',
        action: 'STAGE_COMPLETED',
        author: 'investigator.long.address@example.org',
      },
      {
        caseId: 'case-2',
        caseCode: 'ESAVI-0002',
        occurredAt: '2026-11-03T09:30:00.000Z',
        method: 'ESAVI-CASE-001',
        action: 'CASE_CREATED',
        author: null,
      },
    ],
    myCases: [
      {
        caseId: 'case-1',
        caseCode: 'ESAVI-0001',
        statusCode: 'IN_INVESTIGATION',
        lastActionAt: '2026-11-04T11:00:00.000Z',
        lastAction: 'STAGE_COMPLETED',
      },
    ],
    ...overrides,
  };
}
