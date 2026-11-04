import { type Ref, useId, useState } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  DashboardBatchAlert,
  DashboardBatchAlertReason,
  DashboardPeriod,
} from '@/contracts/dashboard';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { cn } from '@/shared/lib/utils';

// Built with URLSearchParams, never by concatenation: a `T:` key carries free text (SPEC FE37 §7).
// The period is the response's, so the list shows the cases the alert counted (§6).
function casesHref(alert: DashboardBatchAlert, period: DashboardPeriod): string {
  const params = new URLSearchParams({
    batchNumber: alert.batchNumber,
    vaccineKey: alert.vaccineKey,
    reportDateFrom: period.from,
    reportDateTo: period.to,
  });
  return `/esavi-cases?${params.toString()}`;
}

// DEATH always first (SPEC FE37 §3.6); the rest keep the backend's order.
function orderedReasons(reasons: DashboardBatchAlertReason[]): DashboardBatchAlertReason[] {
  return [...reasons].sort((a, b) => Number(b === 'DEATH') - Number(a === 'DEATH'));
}

// Opened by focus and hover as usual, and by a tap too: Radix closes a tooltip on pointerdown and
// never opens one on touch, so the click opens it explicitly (SPEC FE37 §3.7).
function VariantsTooltip({ variants }: { variants: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center rounded-sm text-sm text-muted-foreground underline decoration-dotted underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          {t('dashboard.batchAlerts.variants', { count: variants.length })}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <ul translate="no" className="flex flex-col">
          {variants.map((variant) => (
            <li key={variant}>{variant}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export interface BatchAlertCardProps {
  alert: DashboardBatchAlert;
  period: DashboardPeriod;
  // On the <article>, so the block can move focus to it on «Ver las N alertas» (SPEC FE37 §3.7).
  ref?: Ref<HTMLElement>;
}

export function BatchAlertCard({ alert, period, ref }: BatchAlertCardProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  // ESAVI-CASE-002A is USER minimum; ANALYTICS would land on a 403 (SPEC FE37 §6).
  const canViewCases = useCan(ROLE_LEVELS.USER);
  const countFormat = new Intl.NumberFormat(i18n.language);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  // `YYYY-MM-DD` read at local midnight, so the day shown is the day the backend counted.
  const formatDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00`));
  const metric = (key: string, count: number) =>
    t(`dashboard.batchAlerts.metrics.${key}`, { count, value: countFormat.format(count) });

  return (
    <article
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex-row md:items-end md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id={titleId}
            className="min-w-0 text-base font-medium break-words text-card-foreground"
          >
            <span
              translate={alert.label ? 'no' : undefined}
              className={cn(!alert.label && 'italic')}
            >
              {alert.label ?? t('dashboard.vaccines.noLabel')}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span translate="no">
              {t('dashboard.batchAlerts.batch', { batchNumber: alert.batchNumber })}
            </span>
          </h3>
          {!alert.coded && <Badge variant="outline">{t('dashboard.vaccines.uncoded')}</Badge>}
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {orderedReasons(alert.reasons).map((reason) => (
            <li key={reason}>
              <Badge variant={reason === 'DEATH' ? 'destructive' : 'warning'}>
                {t(`dashboard.batchAlerts.reason.${reason}`)}
              </Badge>
            </li>
          ))}
        </ul>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
          <li>{metric('cases', alert.cases)}</li>
          <li>{metric('suspected', alert.suspectedCases)}</li>
          <li>{metric('serious', alert.serious)}</li>
          <li>{metric('deaths', alert.deaths)}</li>
          <li>{metric('facilities', alert.facilities)}</li>
          <li>{metric('geoUnits', alert.geoUnits)}</li>
          <li>
            {t('dashboard.batchAlerts.metrics.dates', {
              from: formatDate(alert.firstReportDate),
              to: formatDate(alert.lastReportDate),
            })}
          </li>
        </ul>

        {(alert.expiredAtVaccination > 0 || alert.variants.length > 1) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {alert.expiredAtVaccination > 0 && (
              <p className="inline-flex items-center gap-1.5 text-sm text-warning">
                <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                {t('dashboard.batchAlerts.expired', {
                  count: alert.expiredAtVaccination,
                  value: countFormat.format(alert.expiredAtVaccination),
                })}
              </p>
            )}
            {alert.variants.length > 1 && <VariantsTooltip variants={alert.variants} />}
          </div>
        )}
      </div>

      {canViewCases && (
        <Button asChild variant="outline" size="touch" className="w-full shrink-0 md:w-auto">
          {/* Every card says «Ver casos»: the title tells a screen reader which batch it opens. */}
          <Link to={casesHref(alert, period)} aria-describedby={titleId}>
            {t('dashboard.batchAlerts.viewCases')}
          </Link>
        </Button>
      )}
    </article>
  );
}
