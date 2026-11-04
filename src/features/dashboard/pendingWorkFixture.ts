import type { DashboardPendingWork } from '@/contracts/dashboard';
import { CASE_WORKFLOW_STATUS_CODES } from '@/contracts/declared/caseWorkflow';

// Test-only payload of ESAVI-DASH-006 with the eight funnel states, shared by the dashboard and
// home tests so the shape is written once.
export function pendingWorkFixture(overrides: Partial<DashboardPendingWork> = {}): DashboardPendingWork {
  return {
    generatedAt: '2026-11-04T14:05:00.000Z',
    scope: { restricted: true, hasAssignments: true },
    funnel: CASE_WORKFLOW_STATUS_CODES.map((statusCode, index) => ({
      statusCode,
      statusName: statusCode,
      sortOrder: index + 1,
      count: index,
    })),
    openCases: 21,
    stalled: {
      staleDays: 7,
      total: 1,
      items: [
        {
          caseId: 'case-stalled',
          caseCode: 'ESAVI-0007',
          statusCode: 'IN_NOTIFICATION',
          openStage: 'NOTIFICATION',
          referenceAt: '2026-10-20T10:00:00.000Z',
          daysStalled: 15,
        },
      ],
    },
    pendingInvestigations: {
      total: 1,
      items: [
        {
          caseId: 'case-pending',
          caseCode: 'ESAVI-0009',
          statusCode: 'IN_NOTIFICATION',
          requestedAt: '2026-10-30T10:00:00.000Z',
          daysWaiting: 5,
        },
      ],
    },
    reopened: { total: 2 },
    ...overrides,
  };
}
