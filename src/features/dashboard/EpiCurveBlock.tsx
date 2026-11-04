import { useId } from 'react';
import type { TFunction } from 'i18next';
import { ChartColumnIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type {
  DashboardEpiCurve,
  DashboardEpiWeek,
  DashboardPeriodQuery,
} from '@/contracts/dashboard';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from '@/shared/components/ui/chart';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { cn } from '@/shared/lib/utils';
import { useEpiCurve } from './api';
import { chartMinWidth, labelStep, Y_AXIS_WIDTH } from './epiCurveLayout';
import { EpiCurveTable } from './EpiCurveTable';
import { epiWeekRange } from './epiWeekRange';
import { useChartViewParam } from './useChartViewParam';

const SERIES = ['serious', 'nonSerious', 'unclassified'] as const;
const SERIES_COLOR = {
  serious: 'var(--chart-1)',
  nonSerious: 'var(--chart-2)',
  unclassified: 'var(--chart-3)',
} as const;

// Partial edge weeks are drawn faded so they are not read as a drop in cases (F67 §8).
const PARTIAL_WEEK_OPACITY = 0.4;
const CHART_HEIGHT = 'h-[220px] md:h-[280px]';

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.epiCurve.error');
}

function isBadRequest(error: unknown): boolean {
  return error instanceof EsaviApiError && error.status === 400;
}

function EpiCurveTooltip({ active, payload }: TooltipContentProps) {
  const { t, i18n } = useTranslation();
  const week = payload?.[0]?.payload as DashboardEpiWeek | undefined;
  if (!active || !week) return null;
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div>
        <p className="font-medium text-foreground">{week.label}</p>
        <p className="text-muted-foreground">
          {t('dashboard.epiCurve.weekRange', epiWeekRange(week.weekStart, i18n.language))}
        </p>
      </div>
      <dl className="grid gap-1">
        {SERIES.map((series) => (
          <div key={series} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: SERIES_COLOR[series] }}
            />
            <dt className="flex-1 text-muted-foreground">
              {t(`dashboard.epiCurve.series.${series}`)}
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {countFormat.format(week[series])}
            </dd>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t pt-1">
          <dt className="flex-1 text-muted-foreground">{t('dashboard.epiCurve.total')}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {countFormat.format(week.total)}
          </dd>
        </div>
      </dl>
      {week.partial && <p className="text-muted-foreground">{t('dashboard.epiCurve.partial')}</p>}
    </div>
  );
}

function EpiCurveChart({ data }: { data: DashboardEpiCurve }) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const config = Object.fromEntries(
    SERIES.map((series) => [
      series,
      { label: t(`dashboard.epiCurve.series.${series}`), color: SERIES_COLOR[series] },
    ]),
  ) satisfies ChartConfig;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const total = data.weeks.reduce((sum, week) => sum + week.total, 0);
  const summary = t('dashboard.epiCurve.summary', {
    from: dateFormat.format(new Date(`${data.period.from}T00:00:00`)),
    to: dateFormat.format(new Date(`${data.period.to}T00:00:00`)),
    total: new Intl.NumberFormat(i18n.language).format(total),
    weeks: data.weeks.length,
  });

  return (
    <div className="overflow-x-auto">
      <ChartContainer
        config={config}
        role="img"
        aria-label={summary}
        className={cn('aspect-auto w-full', CHART_HEIGHT)}
        style={{ minWidth: chartMinWidth(data.weeks.length) }}
      >
        {/* The table view is the keyboard and screen-reader path; a focusable SVG inside role="img"
            would be announced as nothing. */}
        <BarChart data={data.weeks} accessibilityLayer={false} margin={{ left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={labelStep(data.weeks.length, isMobile) - 1}
          />
          <YAxis
            width={Y_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            // A period with no cases still draws a 0–1 axis instead of a collapsed one.
            domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
          />
          <ChartTooltip
            content={(props) => <EpiCurveTooltip {...props} />}
            // On touch the tooltip sits at the top of the plot, not under the finger (SPEC FE36a §7).
            position={isMobile ? { y: 0 } : undefined}
          />
          <ChartLegend content={<ChartLegendContent />} />
          {SERIES.map((series) => (
            <Bar key={series} dataKey={series} stackId="cases" fill={`var(--color-${series})`}>
              {data.weeks.map((week) => (
                <Cell key={week.label} fillOpacity={week.partial ? PARTIAL_WEEK_OPACITY : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

interface EpiCurveBlockProps {
  query: DashboardPeriodQuery;
  enabled?: boolean;
}

// ESAVI-DASH-008 via useEpiCurve (SPEC FE36a). Every state stays inside the block, so the period
// bar and the indicators above survive a failure here.
export function EpiCurveBlock({ query, enabled = true }: EpiCurveBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { isTable, toggle } = useChartViewParam('epiView');
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } = useEpiCurve(
    query,
    { enabled },
  );
  // A 400 is an invalid period that SurveillanceSection already answers by dropping it (FE35 §3.5).
  const waitingForRetry = isError && isBadRequest(error);

  // No territory: the indicators block above shows the notice once for the whole section.
  if (data && !data.scope.hasAssignments) return null;

  const hasNoCases = data?.weeks.every((week) => week.total === 0) ?? false;

  return (
    <section aria-labelledby={titleId} aria-busy={isFetching} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 id={titleId} className="text-base font-medium text-foreground">
            {t('dashboard.epiCurve.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('dashboard.epiCurve.subtitle')}</p>
        </div>
        {data && !isError && (
          <Button variant="outline" aria-pressed={isTable} onClick={toggle}>
            {isTable ? <ChartColumnIcon aria-hidden="true" /> : <TableIcon aria-hidden="true" />}
            {t(isTable ? 'dashboard.charts.viewChart' : 'dashboard.charts.viewTable')}
          </Button>
        )}
      </div>

      {isError && !waitingForRetry ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage(t, error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : isPending || waitingForRetry || !data ? (
        <Skeleton className={CHART_HEIGHT} />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-3 transition-opacity motion-reduce:transition-none',
            isPlaceholderData && 'opacity-60',
          )}
        >
          {hasNoCases && (
            <p className="text-sm text-muted-foreground">
              {t('dashboard.indicators.noCasesInPeriod')}
            </p>
          )}
          {isTable ? <EpiCurveTable weeks={data.weeks} /> : <EpiCurveChart data={data} />}
        </div>
      )}
    </section>
  );
}
