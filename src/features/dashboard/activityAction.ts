import type { TFunction } from 'i18next';
import type { DashboardActivityAction } from '@/contracts/dashboard';

const ACTIVITY_ACTIONS: readonly DashboardActivityAction[] = [
  'CASE_CREATED',
  'CASE_UPDATED',
  'CASE_DEACTIVATED',
  'CASE_ACTIVATED',
  'WORKFLOW_DEACTIVATED',
  'WORKFLOW_ACTIVATED',
  'STAGE_STARTED',
  'STAGE_COMPLETED',
  'CASE_CLOSED',
  'CASE_REOPENED',
  'VALIDATION_REQUESTED',
  'VALIDATION_RESOLVED',
  'OTHER',
];

// The contract types `action` as a closed union, but a value the backend adds before the next
// contracts:sync still reaches the client at runtime; it reads as OTHER (SPEC FE38 §3.4).
export function activityActionLabel(t: TFunction, action: string): string {
  const known = (ACTIVITY_ACTIONS as readonly string[]).includes(action) ? action : 'OTHER';
  return t(`dashboard.activity.action.${known}`);
}
