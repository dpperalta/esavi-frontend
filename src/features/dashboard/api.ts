import { useQuery } from '@tanstack/react-query';
import type { DashboardPendingWork } from '@/contracts/dashboard';
import { client } from '@/shared/api/client';

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
