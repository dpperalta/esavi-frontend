import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  DashboardEpiCurve,
  DashboardIndicators,
  DashboardPendingWork,
  DashboardPeriodQuery,
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
  const response = await client.get<DashboardIndicators>('/dashboard/indicators', { params: query });
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
