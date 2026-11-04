import { type ReactNode, useId } from 'react';
import type { TFunction } from 'i18next';
import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  DashboardASubcategory,
  DashboardCausalityCategory,
  DashboardComparable,
  DashboardIndicators,
  DashboardNotificationTypeKey,
  DashboardPeriod,
  DashboardPeriodQuery,
  DashboardSeverityCriterion,
} from '@/contracts/dashboard';
import type { CaseWorkflowStage } from '@/contracts/caseWorkflow';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { useIndicators } from './api';
import { formatChange, formatPointChange, share } from './indicatorChange';
import type { IndicatorChange, IndicatorPointChange } from './indicatorChange';

const NOTIFICATION_TYPES: DashboardNotificationTypeKey[] = ['SEVERE', 'NON_SEVERE', 'none'];
const SEVERITY_CRITERIA: DashboardSeverityCriterion[] = [
  'death',
  'disability',
  'congenitalAnomaly',
  'fetalDeath',
  'lifeThreatening',
  'hospitalization',
  'abortion',
  'otherCondition',
];
const STAGES: CaseWorkflowStage[] = ['CLASSIFICATION', 'NOTIFICATION', 'INVESTIGATION', 'FINAL_CLASSIFICATION'];
const CAUSALITY_CATEGORIES: DashboardCausalityCategory[] = ['A', 'B', 'C', 'D', 'UNCLASSIFIED'];
const A_SUBCATEGORIES: DashboardASubcategory[] = [
  'vaccineProduct',
  'qualityDeviation',
  'programmaticError',
  'stress',
];

interface Formatters {
  count: (value: number) => string;
  percent: (ratio: number) => string;
  points: (points: number) => string;
  days: (value: number | null) => string;
  date: (isoDate: string) => string;
}

function useFormatters(): Formatters {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const countFormat = new Intl.NumberFormat(locale);
  const percentFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const pointsFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  });
  const decimalFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return {
    count: (value) => countFormat.format(value),
    percent: (ratio) => percentFormat.format(ratio),
    points: (points) => pointsFormat.format(points),
    // A null median means no case had the two dates to measure (F66 §8): «sin casos», never 0.
    days: (value) =>
      value === null
        ? t('dashboard.indicators.noData')
        : t('dashboard.indicators.days', { count: value, value: decimalFormat.format(value) }),
    // `YYYY-MM-DD` read at local midnight, so the day shown is the day the backend counted.
    date: (isoDate) => dateFormat.format(new Date(`${isoDate}T00:00:00`)),
  };
}

type ChangeValue = IndicatorChange | IndicatorPointChange;

function changeText(t: TFunction, format: Formatters, change: ChangeValue): string {
  switch (change.kind) {
    case 'new':
      return t('dashboard.indicators.change.new');
    case 'none':
      return t('dashboard.indicators.change.none');
    case 'pp':
      return t('dashboard.indicators.change.pp', { value: format.points(change.points) });
    case 'up':
    case 'down':
      return t(`dashboard.indicators.change.${change.kind}`, { value: format.percent(change.ratio) });
  }
}

interface ChangeBadgeProps {
  change: ChangeValue;
  previousValue: string;
  previousPeriod: DashboardPeriod;
}

// Neutral on purpose (SPEC FE35 §6): in ESAVI surveillance more reported cases often means better
// surveillance, so neither direction gets a semantic color.
function ChangeBadge({ change, previousValue, previousPeriod }: ChangeBadgeProps) {
  const { t } = useTranslation();
  const format = useFormatters();
  const isDirectional = change.kind === 'up' || change.kind === 'down';
  const Arrow = change.kind === 'up' ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground tabular-nums outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          {isDirectional && <Arrow aria-hidden="true" className="size-3.5" />}
          <span className={cn(isDirectional && 'sr-only')}>{changeText(t, format, change)}</span>
          {isDirectional && <span aria-hidden="true">{format.percent(change.ratio)}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex flex-col">
          <span>
            {t('dashboard.period.previous', {
              from: format.date(previousPeriod.from),
              to: format.date(previousPeriod.to),
            })}
          </span>
          <span>{t('dashboard.indicators.change.previousValue', { value: previousValue })}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  valueIsPlaceholder?: boolean;
  change?: { value: ChangeValue; previousValue: string; previousPeriod: DashboardPeriod };
}

function KpiTile({ label, value, valueIsPlaceholder = false, change }: KpiTileProps) {
  const { t } = useTranslation();
  const format = useFormatters();
  const accessibleName = change
    ? t('dashboard.indicators.kpi.accessibleName', { label, value, change: changeText(t, format, change.value) })
    : t('dashboard.indicators.kpi.accessibleNameWithoutChange', { label, value });

  return (
    <div
      role="group"
      aria-label={accessibleName}
      className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background p-3"
    >
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          valueIsPlaceholder ? 'text-sm text-muted-foreground' : 'text-2xl font-semibold',
        )}
      >
        {value}
      </span>
      {change && (
        <ChangeBadge
          change={change.value}
          previousValue={change.previousValue}
          previousPeriod={change.previousPeriod}
        />
      )}
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  value: number | null;
  display: string;
}

// One row per category with its value in text; the bar is decorative and scaled to the largest
// value of its own list (SPEC FE35 §3.7).
function BarList({ rows, labelledBy }: { rows: BarRow[]; labelledBy?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));

  return (
    <ul aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-foreground">{row.label}</span>
            <span className="shrink-0 text-foreground tabular-nums">{row.display}</span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-primary"
              // Inline because the width is data, not a class Tailwind can generate ahead of time.
              style={{ width: `${((row.value ?? 0) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4">
      <h4 id={titleId} className="text-sm font-medium text-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function SubList({ title, rows }: { title: string; rows: BarRow[] }) {
  const titleId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={titleId} className="text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <BarList rows={rows} labelledBy={titleId} />
    </div>
  );
}

function comparable(
  format: Formatters,
  value: DashboardComparable,
  previousPeriod: DashboardPeriod,
): KpiTileProps['change'] {
  return {
    value: formatChange(value.current, value.previous),
    previousValue: format.count(value.previous),
    previousPeriod,
  };
}

function Kpis({ data }: { data: DashboardIndicators }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { severity, previousPeriod } = data;
  const currentShare = share(severity.serious.current, severity.classified.current);
  const previousShare = share(severity.serious.previous, severity.classified.previous);
  const pointChange = formatPointChange(currentShare, previousShare);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile
        label={t('dashboard.indicators.kpi.cases')}
        value={format.count(data.volume.total.current)}
        change={comparable(format, data.volume.total, previousPeriod)}
      />
      <KpiTile
        label={t('dashboard.indicators.kpi.seriousPct')}
        value={
          currentShare === null
            ? t('dashboard.indicators.severity.noClassified')
            : format.percent(currentShare)
        }
        valueIsPlaceholder={currentShare === null}
        change={
          pointChange
            ? {
                value: pointChange,
                previousValue:
                  previousShare === null
                    ? t('dashboard.indicators.severity.noClassified')
                    : format.percent(previousShare),
                previousPeriod,
              }
            : undefined
        }
      />
      <KpiTile
        label={t('dashboard.indicators.kpi.deaths')}
        value={format.count(data.deaths.total.current)}
        change={comparable(format, data.deaths.total, previousPeriod)}
      />
      {/* No change: F66 returns this median for the current period only (SPEC FE35 §6). */}
      <KpiTile
        label={t('dashboard.indicators.kpi.timelinessMedian')}
        value={format.days(data.timeliness.medianDays)}
        valueIsPlaceholder={data.timeliness.medianDays === null}
      />
    </div>
  );
}

function DetailCards({ data }: { data: DashboardIndicators }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { volume, severity, deaths, timeliness, closure, causality } = data;
  const countRow = (key: string, label: string, value: number): BarRow => ({
    key,
    label,
    value,
    display: format.count(value),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DetailCard title={t('dashboard.indicators.severity.title')}>
        <SubList
          title={t('dashboard.indicators.volume.title')}
          rows={NOTIFICATION_TYPES.map((type) =>
            countRow(type, t(`dashboard.indicators.volume.${type}`), volume.byNotificationType[type].current),
          )}
        />
        <SubList
          title={t('dashboard.indicators.severity.criteriaTitle')}
          rows={SEVERITY_CRITERIA.map((criterion) =>
            countRow(
              criterion,
              t(`dashboard.indicators.severity.criteria.${criterion}`),
              severity.criteria[criterion],
            ),
          )}
        />
        <p className="text-sm text-muted-foreground">
          {t('dashboard.indicators.severity.classified', { count: severity.classified.current })}
          {' · '}
          {t('dashboard.indicators.severity.unclassified', { count: severity.unclassified.current })}
        </p>
      </DetailCard>

      <DetailCard title={t('dashboard.indicators.deaths.title')}>
        <BarList
          rows={[
            countRow('total', t('dashboard.indicators.kpi.deaths'), deaths.total.current),
            countRow('autopsyRequested', t('dashboard.indicators.deaths.autopsyRequested'), deaths.autopsyRequested),
            countRow('autopsyPerformed', t('dashboard.indicators.deaths.autopsyPerformed'), deaths.autopsyPerformed),
          ]}
        />
      </DetailCard>

      <DetailCard title={t('dashboard.indicators.timeliness.title')}>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('dashboard.indicators.kpi.timelinessMedian')}</dt>
          <dd className="text-right text-foreground tabular-nums">{format.days(timeliness.medianDays)}</dd>
        </dl>
        {timeliness.onTime === null ? (
          // No deadline in systemConfig means on-time cannot be judged (F66 §8), not that none was.
          <p className="text-sm text-muted-foreground">{t('dashboard.indicators.timeliness.noDeadline')}</p>
        ) : (
          <BarList
            rows={[
              {
                key: 'onTime',
                label: t('dashboard.indicators.timeliness.onTime', {
                  count: format.count(timeliness.onTime),
                  total: format.count(timeliness.withEventDate),
                }),
                value: share(timeliness.onTime, timeliness.withEventDate) ?? 0,
                display:
                  share(timeliness.onTime, timeliness.withEventDate) === null
                    ? t('dashboard.indicators.noData')
                    : format.percent(share(timeliness.onTime, timeliness.withEventDate) ?? 0),
              },
            ]}
          />
        )}
        <p className="text-sm text-muted-foreground">
          {timeliness.deadlineDays !== null && (
            <>
              {t('dashboard.indicators.timeliness.deadline', { days: format.days(timeliness.deadlineDays) })}
              {' · '}
            </>
          )}
          {t('dashboard.indicators.timeliness.withoutEventDate', { count: timeliness.withoutEventDate })}
        </p>
      </DetailCard>

      <DetailCard title={t('dashboard.indicators.closure.title')}>
        <p className="text-sm text-foreground">
          {t('dashboard.indicators.closure.closedCases', { count: closure.closedCases })}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
          <dt className="text-muted-foreground">{t('dashboard.indicators.closure.median')}</dt>
          <dd className="text-right text-foreground tabular-nums">{format.days(closure.medianDaysToClose)}</dd>
        </dl>
        <BarList
          rows={STAGES.map((stage) => ({
            key: stage,
            label: t(`caseWorkflow.stage.${stage}`),
            value: closure.stageMedianDays[stage],
            display: format.days(closure.stageMedianDays[stage]),
          }))}
        />
      </DetailCard>

      <DetailCard title={t('dashboard.indicators.causality.title')}>
        <BarList
          rows={CAUSALITY_CATEGORIES.map((category) =>
            countRow(category, t(`dashboard.indicators.causality.${category}`), causality.categories[category]),
          )}
        />
        {/* Not the same as UNCLASSIFIED above (F66 §8): these cases have no final classification
            at all, while UNCLASSIFIED ones were finally classified as such. */}
        <p className="text-sm text-muted-foreground">
          {t('dashboard.indicators.causality.withoutFinalClassification', {
            count: causality.withoutFinalClassification,
          })}
        </p>
        <SubList
          title={t('dashboard.indicators.causality.aSub.note')}
          rows={A_SUBCATEGORIES.map((subcategory) =>
            countRow(
              subcategory,
              t(`dashboard.indicators.causality.aSub.${subcategory}`),
              causality.aSubcategories[subcategory],
            ),
          )}
        />
      </DetailCard>
    </div>
  );
}

function IndicatorsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-48" />
        ))}
      </div>
    </div>
  );
}

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.indicators.error');
}

function isBadRequest(error: unknown): boolean {
  return error instanceof EsaviApiError && error.status === 400;
}

interface IndicatorsBlockProps {
  query: DashboardPeriodQuery;
  enabled?: boolean;
}

// ESAVI-DASH-007 via useIndicators (SPEC FE35). Every state stays inside the block, so the
// greeting, «Trabajo pendiente» and the period bar above survive a failure here.
export function IndicatorsBlock({ query, enabled = true }: IndicatorsBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } = useIndicators(
    query,
    { enabled },
  );
  // A 400 is an invalid period, not a block failure: SurveillanceSection drops the period and
  // asks again, so the block just waits for that answer (SPEC FE35 §3.5).
  const waitingForRetry = isError && isBadRequest(error);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isFetching}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} className="text-base font-medium text-foreground">
          {t('dashboard.indicators.title')}
        </h3>
        {data && !isError && (
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCwIcon aria-hidden="true" className={cn(isFetching && 'motion-safe:animate-spin')} />
            {t('dashboard.pendingWork.refresh')}
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
        <IndicatorsSkeleton />
      ) : !data.scope.hasAssignments ? (
        <p className="rounded-lg border bg-muted p-3 text-sm">{t('dashboard.pendingWork.noAssignments')}</p>
      ) : (
        // Previous numbers stay while the new period loads (keepPreviousData), dimmed so they are
        // not read as the new period's (SPEC FE35 §7).
        <div className={cn('flex flex-col gap-4 transition-opacity motion-reduce:transition-none', isPlaceholderData && 'opacity-60')}>
          {data.volume.total.current === 0 && (
            <p className="text-sm text-muted-foreground">{t('dashboard.indicators.noCasesInPeriod')}</p>
          )}
          <Kpis data={data} />
          <DetailCards data={data} />
        </div>
      )}
    </section>
  );
}
