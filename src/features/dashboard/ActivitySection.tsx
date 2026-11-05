import { useId } from 'react';
import type { TFunction } from 'i18next';
import { RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useRecentActivity } from './api';
import { MyCasesList } from './MyCasesList';
import { TerritoryActivityFeed } from './TerritoryActivityFeed';

function ActivitySkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }, (_, list) => (
        <div key={list} className="flex flex-col gap-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 4 }, (_, row) => (
            <Skeleton key={row} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}

function formatTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(timestamp),
  );
}

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.activity.error');
}

// ESAVI-DASH-011 via useRecentActivity (SPEC FE38). A snapshot with no period, so it sits with
// «Trabajo pendiente» above the period bar. Every state stays inside the section.
export function ActivitySection() {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { data, dataUpdatedAt, isPending, isError, error, isFetching, refetch } =
    useRecentActivity();

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isFetching}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-medium">
            {t('dashboard.activity.title')}
          </h2>
          {/* The response has no generatedAt; dataUpdatedAt is cache metadata, not a copy of a
              server value (SPEC FE38 §3.4). */}
          {data && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {t('dashboard.activity.updatedAt', {
                time: formatTime(dataUpdatedAt, i18n.language),
              })}
            </p>
          )}
        </div>
        {data && !isError && (
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCwIcon
              aria-hidden="true"
              className={cn(isFetching && 'motion-safe:animate-spin')}
            />
            {t('dashboard.activity.refresh')}
          </Button>
        )}
      </div>

      {isPending ? (
        <ActivitySkeleton />
      ) : isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage(t, error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data.scope.hasAssignments ? (
        <p className="rounded-lg border bg-muted p-3 text-sm">
          {t('dashboard.pendingWork.noAssignments')}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <MyCasesList items={data.myCases} windowDays={data.windowDays} />
            <TerritoryActivityFeed items={data.territory} windowDays={data.windowDays} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.activity.window', { days: data.windowDays })}
          </p>
        </>
      )}
    </section>
  );
}
