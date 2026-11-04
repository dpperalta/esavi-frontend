import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  DashboardBatchAlerts,
  DashboardDistributions,
  DashboardEpiCurve,
  DashboardIndicators,
  DashboardPendingWork,
  DashboardPeriodQuery,
  DashboardRecentActivity,
  DashboardSystemActivity,
} from '@/contracts/dashboard';
import { client } from '@/shared/api/client';
import { EsaviApiError } from '@/shared/api/types';

// Hand-written, not createResource (SPEC FE34 §6): the dashboard domain is read-only aggregates
// with no 002A/002B, no `:id` and no mutations.

export const pendingWorkKey = ['dashboard', 'pendingWork'] as const;

// ESAVI-DASH-006 — status funnel, stalled cases, pending investigations and reopened count,
// all scoped to the user's territory (SPEC F65, F49)
async function fetchPendingWork(): Promise<DashboardPendingWork> {
  const response = await client.get<DashboardPendingWork>('/dashboard/pending-work');
  return response.data;
}

export function usePendingWork() {
  return useQuery({
    queryKey: pendingWorkKey,
    queryFn: fetchPendingWork,
    // No mutation invalidates this key (SPEC FE34 §3.4): coming back to Inicio after the wizard
    // almost always finds it stale already, and «Actualizar» covers the rest.
    staleTime: 60_000,
  });
}

// ESAVI-DASH-007 — surveillance indicators of a period against the previous one of the same
// length, scoped to the user's territory (SPEC F66, F49). ANALYTICS is its minimum role.
async function fetchIndicators(query: DashboardPeriodQuery): Promise<DashboardIndicators> {
  const response = await client.get<DashboardIndicators>('/dashboard/indicators', {
    params: query,
  });
  return response.data;
}

// A 4xx answers the same on every retry; retrying it would only delay the invalid-period notice
// that a 400 triggers (SPEC FE35 §3.5).
function retryUnlessClientError(failureCount: number, error: Error): boolean {
  if (error instanceof EsaviApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
}

export function useIndicators(query: DashboardPeriodQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard', 'indicators', query],
    queryFn: () => fetchIndicators(query),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    // Switching period keeps the previous numbers on screen, dimmed, instead of a skeleton flash
    // on every shortcut click (SPEC FE35 §6).
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

// ESAVI-DASH-008 — cases per PAHO epidemiological week of reportDate (Sunday–Saturday), split
// serious / non-serious / unclassified, with `partial` edge weeks (SPEC F67). ANALYTICS minimum.
async function fetchEpiCurve(query: DashboardPeriodQuery): Promise<DashboardEpiCurve> {
  const response = await client.get<DashboardEpiCurve>('/dashboard/epi-curve', { params: query });
  return response.data;
}

// Same query, staleTime and placeholder as useIndicators (SPEC FE36a §3.4): both blocks change
// period together and must never show two different periods at once.
export function useEpiCurve(query: DashboardPeriodQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard', 'epiCurve', query],
    queryFn: () => fetchEpiCurve(query),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

// ESAVI-DASH-009 — suspected vaccines (top 10 + others), sex × age matrix, geography and
// programmatic failures of the period, in one response (SPEC F67). ANALYTICS minimum.
async function fetchDistributions(query: DashboardPeriodQuery): Promise<DashboardDistributions> {
  const response = await client.get<DashboardDistributions>('/dashboard/distributions', {
    params: query,
  });
  return response.data;
}

// One key for FE36b and FE36c (SPEC FE36b §6): geography arrives in the same response, so the map
// reads this cache instead of asking again.
export function useDistributions(query: DashboardPeriodQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard', 'distributions', query],
    queryFn: () => fetchDistributions(query),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

// ESAVI-DASH-010 — vaccine batches over the cases, serious or deaths thresholds of the period,
// scoped to the user's territory, at most 50 and already ordered (SPEC F68). ANALYTICS minimum.
async function fetchBatchAlerts(query: DashboardPeriodQuery): Promise<DashboardBatchAlerts> {
  const response = await client.get<DashboardBatchAlerts>('/dashboard/batch-alerts', {
    params: query,
  });
  return response.data;
}

// Same query as 007–009 and no previous period (SPEC FE37 §3.2), so it changes period with them.
export function useBatchAlerts(query: DashboardPeriodQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard', 'batchAlerts', query],
    queryFn: () => fetchBatchAlerts(query),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

export const recentActivityKey = ['dashboard', 'recentActivity'] as const;

// ESAVI-DASH-011 — last 20 events of the user's territory and the last 10 cases the user acted
// on, read from the esaviCase / caseWorkflow audit trail over a fixed window (SPEC F69, F49).
// USER minimum; `author` arrives only for ADMIN and SUPERADMIN (SPEC F59).
async function fetchRecentActivity(): Promise<DashboardRecentActivity> {
  const response = await client.get<DashboardRecentActivity>('/dashboard/recent-activity');
  return response.data;
}

// No mutation invalidates this key, as with pendingWork (SPEC FE38 §3.4). The response carries no
// generatedAt, so the section header reads the query's dataUpdatedAt instead.
export function useRecentActivity() {
  return useQuery({
    queryKey: recentActivityKey,
    queryFn: fetchRecentActivity,
    staleTime: 60_000,
  });
}

export const systemActivityKey = ['dashboard', 'systemActivity'] as const;

// ESAVI-DASH-012 — active sessions, active users, sessions started and refresh-token revocations
// of the last 7 days by reason, REUSE_DETECTED included (SPEC F69, F42). SUPERADMIN minimum.
async function fetchSystemActivity(): Promise<DashboardSystemActivity> {
  const response = await client.get<DashboardSystemActivity>('/dashboard/system-activity');
  return response.data;
}

export function useSystemActivity() {
  return useQuery({
    queryKey: systemActivityKey,
    queryFn: fetchSystemActivity,
    staleTime: 60_000,
  });
}
