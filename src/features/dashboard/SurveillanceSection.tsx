import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { EsaviApiError } from '@/shared/api/types';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIndicators } from './api';
import { DashboardPeriodBar } from './DashboardPeriodBar';
import { IndicatorsBlock } from './IndicatorsBlock';
import { useDashboardPeriod } from './useDashboardPeriod';

// Recharts added 109 kB gzip to the entry bundle, over the 100 kB threshold of SPEC FE36a §7, and
// Inicio is the first screen every role lands on: the curve and its library load on their own chunk.
const EpiCurveBlock = lazy(() =>
  import('./EpiCurveBlock').then((module) => ({ default: module.EpiCurveBlock })),
);

// «Vigilancia» (SPEC FE35): the period bar and, below it, every block that reads the period.
// FE36 and FE37 add their blocks here and read the same useDashboardPeriod().
export function SurveillanceSection() {
  const { t } = useTranslation();
  const titleId = useId();
  const [, setSearchParams] = useSearchParams();
  const period = useDashboardPeriod();
  // Same key as IndicatorsBlock's own call, so this is one request: the section only reads the
  // period on screen and whether the backend rejected it.
  const indicators = useIndicators(period.query, { enabled: period.isReady });
  const rejectedByServer =
    indicators.error instanceof EsaviApiError && indicators.error.status === 400;
  // A 400 is answered by dropping the period, which leaves nothing in the URL to derive the notice
  // from; this remembers it only until the user picks a period again (mode leaves 'default').
  const [periodWasRejected, setPeriodWasRejected] = useState(false);

  useEffect(() => {
    if (!rejectedByServer) return;
    setPeriodWasRejected(true);
    // The form already blocks what the backend rejects, so a 400 is a client clock ahead of the
    // server or a hand-edited link (SPEC FE35 §7): fall back to the default, never an error screen.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('range');
        next.delete('from');
        next.delete('to');
        return next;
      },
      { replace: true },
    );
  }, [rejectedByServer, setSearchParams]);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6"
    >
      <h2 id={titleId} className="text-lg font-medium">
        {t('dashboard.surveillance.title')}
      </h2>
      <DashboardPeriodBar
        displayedPeriod={indicators.data?.period}
        serverRejected={periodWasRejected && period.params.mode === 'default'}
      />
      <IndicatorsBlock query={period.query} enabled={period.isReady} />
      <Suspense fallback={<Skeleton className="h-[220px] md:h-[280px]" />}>
        <EpiCurveBlock query={period.query} enabled={period.isReady} />
      </Suspense>
    </section>
  );
}
