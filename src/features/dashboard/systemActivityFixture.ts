import type { DashboardSystemActivity } from '@/contracts/dashboard';

// Test-only payload of ESAVI-DASH-012 with the six reasons the backend always returns (SPEC F69).
export function systemActivityFixture(
  overrides: Partial<DashboardSystemActivity> = {},
): DashboardSystemActivity {
  return {
    generatedAt: '2026-11-04T14:05:00.000Z',
    activeSessions: 12,
    activeUsers24h: 8,
    activeUsers7d: 19,
    sessionsStarted24h: 15,
    sessionsStarted7d: 64,
    revocations7d: [
      { reason: 'LOGOUT', count: 9 },
      { reason: 'LOGOUT_ALL', count: 1 },
      { reason: 'REUSE_DETECTED', count: 0 },
      { reason: 'PASSWORD_CHANGED', count: 2 },
      { reason: 'PASSWORD_RESET', count: 0 },
      { reason: 'ABSOLUTE_MAX_REACHED', count: 3 },
    ],
    ...overrides,
  };
}
