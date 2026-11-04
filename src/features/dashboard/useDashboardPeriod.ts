import { format, parseISO, subDays } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import type { DashboardPeriodQuery } from '@/contracts/dashboard';
import { useCurrentUser } from '@/features/auth/api';
import { useUserGeoCoverage } from '@/features/userGeoLocation/api';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { parseDashboardPeriod } from './dashboardPeriod';
import type { DashboardPeriodParams, DashboardRange } from './dashboardPeriod';

const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// A shortcut sends `from` only and lets the backend fill `to` with its own current_date: a client
// clock one day ahead would otherwise 400 on «to is in the future» (SPEC FE35 §6). No params at
// all sends nothing, so the 30-day default lives only on the backend.
export function toDashboardPeriodQuery(params: DashboardPeriodParams, today: string): DashboardPeriodQuery {
  const query: DashboardPeriodQuery = {};
  if (params.mode === 'range' && params.range) {
    query.from = format(subDays(parseISO(today), RANGE_DAYS[params.range] - 1), 'yyyy-MM-dd');
  } else if (params.mode === 'custom') {
    query.from = params.from;
    query.to = params.to;
  }
  if (params.geoLocationId) query.geoLocationId = params.geoLocationId;
  return query;
}

export interface DashboardPeriodState {
  params: DashboardPeriodParams;
  query: DashboardPeriodQuery;
  periodDiscarded: boolean;
  geoLocationIdDiscarded: boolean;
  // False only while a USER–EVALUATOR geoLocationId waits for its coverage check: sending it
  // first and dropping it after would request the same block twice.
  isReady: boolean;
}

// The only reader of the dashboard period (SPEC FE35 §7): FE36 and FE37 call this instead of
// parsing the URL themselves.
export function useDashboardPeriod(): DashboardPeriodState {
  const [searchParams] = useSearchParams();
  const today = todayIsoDate();
  const parsed = parseDashboardPeriod(searchParams, today);

  const canUseCoverage = useCan(ROLE_LEVELS.USER);
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  // ANALYTICS has no coverage route to check against (both sources are USER, SPEC FE35 §3.1) and
  // ADMIN+ picks from the whole tree, so only USER–EVALUATOR is checked; a foreign id would get
  // zeros with 200 (F66 §6) and read as «no cases».
  const checksCoverage = canUseCoverage && !isAdmin && parsed.params.geoLocationId !== undefined;
  const { data: user } = useCurrentUser();
  const coverage = useUserGeoCoverage(checksCoverage ? (user?.userId ?? '') : '');

  let { params, geoLocationIdDiscarded } = parsed;
  let isReady = true;

  if (checksCoverage) {
    if (coverage.isSuccess) {
      const inCoverage = coverage.data.coverage.some(
        (unit) => unit.geoLocationId === params.geoLocationId,
      );
      if (!inCoverage) {
        params = { ...params, geoLocationId: undefined };
        geoLocationIdDiscarded = true;
      }
    } else if (coverage.isError) {
      params = { ...params, geoLocationId: undefined };
      geoLocationIdDiscarded = true;
    } else {
      isReady = false;
    }
  }

  return {
    params,
    query: toDashboardPeriodQuery(params, today),
    periodDiscarded: parsed.periodDiscarded,
    geoLocationIdDiscarded,
    isReady,
  };
}
