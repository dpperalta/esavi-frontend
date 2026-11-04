import { useEffect, useId, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { DashboardBatchAlerts, DashboardPeriodQuery } from '@/contracts/dashboard';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useBatchAlerts } from './api';
import { BatchAlertCard } from './BatchAlertCard';

// The backend already orders by severity, so the first five are the ones that matter (§6).
const COLLAPSED_COUNT = 5;

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.batchAlerts.error');
}

function isBadRequest(error: unknown): boolean {
  return error instanceof EsaviApiError && error.status === 400;
}

function ThresholdsLine({ thresholds }: { thresholds: DashboardBatchAlerts['thresholds'] }) {
  const { t } = useTranslation();
  // A null threshold is disabled in system configuration (F68 §3.3); it still holds its place.
  const parts = [
    thresholds.minCases === null
      ? t('dashboard.batchAlerts.thresholds.disabled', { context: 'minCases' })
      : t('dashboard.batchAlerts.thresholds.minCases', { count: thresholds.minCases }),
    thresholds.minSerious === null
      ? t('dashboard.batchAlerts.thresholds.disabled', { context: 'minSerious' })
      : t('dashboard.batchAlerts.thresholds.minSerious', { count: thresholds.minSerious }),
    t('dashboard.batchAlerts.thresholds.death'),
  ];

  return (
    <p className="text-sm text-muted-foreground">
      {t('dashboard.batchAlerts.thresholds.label')}: {parts.join(' · ')}
    </p>
  );
}

function BatchAlertsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-32 md:h-24" />
      ))}
    </div>
  );
}

export interface BatchAlertsBlockProps {
  query: DashboardPeriodQuery;
  enabled?: boolean;
}

// «Alertas por lote» (SPEC FE37): the one block of Inicio where color judges — DEATH in
// destructive, the rest in warning — declared exception to FE35's neutral palette, kept to the
// card's reasons and the expired mark.
export function BatchAlertsBlock({ query, enabled = true }: BatchAlertsBlockProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } =
    useBatchAlerts(query, { enabled });
  // Tied to the period it was opened for, so a new period starts collapsed again (§3.4) without
  // an effect resetting it.
  const periodKey = data ? `${data.period.from}/${data.period.to}` : null;
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = periodKey !== null && expandedFor === periodKey;
  const firstHiddenRef = useRef<HTMLElement>(null);
  const focusFirstHidden = useRef(false);
  // A 400 is an invalid period that SurveillanceSection already answers by dropping it (FE35 §3.5).
  const waitingForRetry = isError && isBadRequest(error);

  useEffect(() => {
    if (!expanded || !focusFirstHidden.current) return;
    focusFirstHidden.current = false;
    firstHiddenRef.current?.focus();
  }, [expanded]);

  // No territory: the indicators block above shows the notice once for the whole section.
  if (data && !data.scope.hasAssignments) return null;

  const countFormat = new Intl.NumberFormat(i18n.language);

  function toggleExpanded() {
    if (expanded) {
      setExpandedFor(null);
      return;
    }
    focusFirstHidden.current = true;
    setExpandedFor(periodKey);
  }

  return (
    <section aria-labelledby={titleId} aria-busy={isFetching} className="flex flex-col gap-4">
      <h3 id={titleId} className="text-base font-medium text-foreground">
        {t('dashboard.batchAlerts.title')}
      </h3>

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
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <BatchAlertsSkeleton />
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-3 transition-opacity motion-reduce:transition-none',
            isPlaceholderData && 'opacity-60',
          )}
        >
          <div className="flex flex-col gap-0.5">
            <ThresholdsLine thresholds={data.thresholds} />
            <p className="text-sm text-muted-foreground">
              {t('dashboard.batchAlerts.evaluated', {
                count: data.batchesEvaluated,
                value: countFormat.format(data.batchesEvaluated),
              })}
              {' · '}
              {t('dashboard.batchAlerts.withoutBatch', {
                count: data.casesWithoutBatch,
                value: countFormat.format(data.casesWithoutBatch),
              })}
            </p>
          </div>

          {data.alerts.length === 0 ? (
            <p className="rounded-lg border bg-muted p-3 text-sm">
              {t('dashboard.batchAlerts.empty')}
            </p>
          ) : (
            <>
              <ol className="flex flex-col gap-3">
                {(expanded ? data.alerts : data.alerts.slice(0, COLLAPSED_COUNT)).map(
                  (alert, index) => (
                    <li key={`${alert.vaccineKey}|${alert.batchNumber}`}>
                      <BatchAlertCard
                        alert={alert}
                        period={data.period}
                        ref={index === COLLAPSED_COUNT ? firstHiddenRef : undefined}
                      />
                    </li>
                  ),
                )}
              </ol>
              {data.alerts.length > COLLAPSED_COUNT && (
                <Button
                  variant="outline"
                  size="touch"
                  aria-expanded={expanded}
                  onClick={toggleExpanded}
                  className="w-full md:w-auto md:self-start"
                >
                  {expanded
                    ? t('dashboard.batchAlerts.showLess')
                    : t('dashboard.batchAlerts.showAll', { count: data.alerts.length })}
                </Button>
              )}
            </>
          )}

          {data.total > data.alerts.length && (
            <p className="text-sm text-muted-foreground">
              {t('dashboard.batchAlerts.truncated', {
                count: data.total - data.alerts.length,
                value: countFormat.format(data.total - data.alerts.length),
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
