import { DASHBOARD_RANGES, dashboardPeriodSchema } from './schemas';

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardPeriodParams {
  mode: 'default' | 'range' | 'custom';
  range?: DashboardRange;
  from?: string;
  to?: string;
  geoLocationId?: string;
}

export interface ParsedDashboardPeriod {
  params: DashboardPeriodParams;
  periodDiscarded: boolean;
  geoLocationIdDiscarded: boolean;
}

export const DASHBOARD_PERIOD_PARAM_KEYS = ['range', 'from', 'to', 'geoLocationId'] as const;

function readParam(searchParams: URLSearchParams, key: string): string | undefined {
  return searchParams.get(key) || undefined;
}

// The URL is not a form: an invalid period is dropped whole (range, from and to) and the backend
// default applies, while a malformed geoLocationId is dropped on its own (SPEC FE35 §3.5).
// from/to win over range when both arrive (§3.4), so range is not even looked at then.
export function parseDashboardPeriod(searchParams: URLSearchParams, today: string): ParsedDashboardPeriod {
  const schema = dashboardPeriodSchema(today);
  const params: DashboardPeriodParams = { mode: 'default' };
  let periodDiscarded = false;
  let geoLocationIdDiscarded = false;

  const from = readParam(searchParams, 'from');
  const to = readParam(searchParams, 'to');
  const range = readParam(searchParams, 'range');

  if (from !== undefined || to !== undefined) {
    const result = schema.safeParse({ from, to });
    if (result.success) Object.assign(params, { mode: 'custom', from, to });
    else periodDiscarded = true;
  } else if (range !== undefined) {
    const result = schema.safeParse({ range });
    if (result.success) Object.assign(params, { mode: 'range', range: result.data.range });
    else periodDiscarded = true;
  }

  const geoLocationId = readParam(searchParams, 'geoLocationId');
  if (geoLocationId !== undefined) {
    if (schema.safeParse({ geoLocationId }).success) params.geoLocationId = geoLocationId;
    else geoLocationIdDiscarded = true;
  }

  return { params, periodDiscarded, geoLocationIdDiscarded };
}
