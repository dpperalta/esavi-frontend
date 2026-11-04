import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { DashboardPeriodQuery } from '@/contracts/dashboard';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useDistributions } from './api';
import { ProgrammaticBlock } from './ProgrammaticBlock';
import { SexAgeBlock } from './SexAgeBlock';
import { VaccinesBlock } from './VaccinesBlock';

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.distributions.error');
}

function isBadRequest(error: unknown): boolean {
  return error instanceof EsaviApiError && error.status === 400;
}

function BarsSkeleton({ rows, rowHeight }: { rows: number; rowHeight: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={rowHeight} />
      ))}
    </div>
  );
}

// One shape per block (SPEC FE36b §3.6): 6 vaccine bars, 9 pyramid rows and two failure cards.
function DistributionsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <BarsSkeleton rows={6} rowHeight="h-6" />
        <BarsSkeleton rows={9} rowHeight="h-5" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

interface DistributionsSectionProps {
  query: DashboardPeriodQuery;
  enabled?: boolean;
}

// ESAVI-DASH-009 via useDistributions (SPEC FE36b). The only caller of the hook in this screen:
// the three blocks share one request, so loading, error and retry are one too (§6). FE36c adds
// `geography` here.
export function DistributionsSection({ query, enabled = true }: DistributionsSectionProps) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } =
    useDistributions(query, { enabled });
  // A 400 is an invalid period that SurveillanceSection already answers by dropping it (FE35 §3.5).
  const waitingForRetry = isError && isBadRequest(error);

  // No territory: the indicators block above shows the notice once for the whole section.
  if (data && !data.scope.hasAssignments) return null;

  if (isError && !waitingForRetry) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-muted-foreground">
          {errorMessage(t, error)}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (isPending || waitingForRetry || !data) return <DistributionsSkeleton />;

  return (
    // Previous distributions stay while the new period loads (keepPreviousData), dimmed so they
    // are not read as the new period's.
    <div
      aria-busy={isFetching}
      className={cn(
        'flex flex-col gap-6 transition-opacity motion-reduce:transition-none',
        isPlaceholderData && 'opacity-60',
      )}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <VaccinesBlock data={data.vaccines} />
        <SexAgeBlock data={data.sexAge} />
      </div>
      <ProgrammaticBlock data={data.programmatic} />
    </div>
  );
}
