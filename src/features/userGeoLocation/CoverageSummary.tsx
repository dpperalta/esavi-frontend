import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useUserGeoCoverage } from './api';

interface CoverageSummaryProps {
  userId: string;
}

// ESAVI-USERGEO-008 — the expansion the assignments alone don't show: someone assigned a province
// covers every canton inside it, and that is what the wizard of FE10 filters health facilities
// against. `coverage` INCLUDES the assigned nodes, so it is the whole answer and `assigned` is
// not listed beside it (contracts/declared/userGeoLocation.ts).
export function CoverageSummary({ userId }: CoverageSummaryProps) {
  const { t } = useTranslation();
  const coverage = useUserGeoCoverage(userId);

  if (coverage.isLoading) {
    return <Skeleton className="h-11 w-full" />;
  }

  if (coverage.isError || !coverage.data) {
    const message =
      coverage.error instanceof EsaviApiError
        ? getErrorMessage(coverage.error)
        : t('common.errors.unexpected');
    return <p className="text-sm text-destructive">{message}</p>;
  }

  const { coverage: covered, count } = coverage.data;

  if (count === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('userGeoLocation.coverage.title')}</span>
        <p className="text-sm text-muted-foreground">{t('userGeoLocation.coverage.empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{t('userGeoLocation.coverage.title')}</span>
      {/* Native disclosure: keyboard, focus and expanded state come for free, and the count stays
          readable while it is collapsed (SPEC FE22 §3.7). */}
      <details className="rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">{t('userGeoLocation.coverage.count', { count })}</span>
          <span className="text-xs text-muted-foreground">
            {t('userGeoLocation.coverage.expand')}
          </span>
        </summary>
        <ul className="flex flex-col gap-1 border-t border-border px-3 py-2">
          {covered.map((location) => (
            <li
              key={location.geoLocationId}
              className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground"
            >
              <span className="min-w-0 break-words">{location.name}</span>
              <span className="text-xs text-muted-foreground">
                {t('userGeoLocation.columns.level')} {location.level}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
