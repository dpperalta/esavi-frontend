import { useId } from 'react';
import type { TFunction } from 'i18next';
import { RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardSystemActivity } from '@/contracts/dashboard';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useSystemActivity } from './api';
import { CategoryBarList, type CategoryBarRow } from './CategoryBarList';

const COUNTERS = [
  'activeSessions',
  'activeUsers24h',
  'activeUsers7d',
  'sessionsStarted24h',
  'sessionsStarted7d',
] as const satisfies readonly (keyof DashboardSystemActivity)[];

const KNOWN_REASONS = [
  'LOGOUT',
  'LOGOUT_ALL',
  'REUSE_DETECTED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ABSOLUTE_MAX_REACHED',
  'UNSPECIFIED',
  'OTHER',
] as const;

const REUSE_DETECTED = 'REUSE_DETECTED';

// `reason` is free text in the contract (F69 §3.3): a reason the backend adds later must not leave
// a bar without a label, so it reads as OTHER (SPEC FE38 §6).
function reasonLabel(t: TFunction, reason: string): string {
  const known = (KNOWN_REASONS as readonly string[]).includes(reason) ? reason : 'OTHER';
  return t(`dashboard.system.reason.${known}`);
}

function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.system.error');
}

function SystemSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {COUNTERS.map((counter) => (
          <Skeleton key={counter} className="h-18" />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <Skeleton className="h-4 w-56" />
        {Array.from({ length: 6 }, (_, row) => (
          <Skeleton key={row} className="h-7" />
        ))}
      </div>
    </div>
  );
}

// Second declared exception to the dashboard's neutral palette, after the batch alerts: a reused
// refresh token is the footprint of a stolen one (F42) and calls for action (SPEC FE38 §6).
// It stays mounted across refetches, so an unchanged count is not announced again; role="alert"
// only speaks when the element appears or its text changes.
function ReuseAlert({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
    >
      <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p>{t('dashboard.system.reuseAlert', { count })}</p>
    </div>
  );
}

function SystemContent({ data }: { data: DashboardSystemActivity }) {
  const { t, i18n } = useTranslation();
  const revocationsTitleId = useId();
  const number = new Intl.NumberFormat(i18n.language);
  const reuseCount = data.revocations7d.find((row) => row.reason === REUSE_DETECTED)?.count ?? 0;
  const noRevocations = data.revocations7d.every((row) => row.count === 0);
  const rows: CategoryBarRow[] = data.revocations7d.map((row) => ({
    key: row.reason,
    label: reasonLabel(t, row.reason),
    value: row.count,
    display: number.format(row.count),
  }));

  return (
    <div className="flex flex-col gap-4">
      {reuseCount > 0 && <ReuseAlert count={reuseCount} />}
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {COUNTERS.map((counter) => (
          <div key={counter} className="flex flex-col gap-1 rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">
              {t(`dashboard.system.counters.${counter}`)}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{number.format(data[counter])}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <h3 id={revocationsTitleId} className="text-sm font-medium">
          {t('dashboard.system.revocations.title')}
        </h3>
        <CategoryBarList rows={rows} labelledBy={revocationsTitleId} />
        {noRevocations && (
          <p className="text-sm text-muted-foreground">{t('dashboard.system.noRevocations')}</p>
        )}
      </div>
    </div>
  );
}

// ESAVI-DASH-012 via useSystemActivity (SPEC FE38). SUPERADMIN only, mounted last on Inicio:
// administration, not surveillance. Its header time is the server's generatedAt.
export function SystemActivitySection() {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { data, isPending, isError, error, isFetching, refetch } = useSystemActivity();

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isFetching}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-medium">
            {t('dashboard.system.title')}
          </h2>
          {data && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {t('dashboard.system.updatedAt', {
                time: formatTime(data.generatedAt, i18n.language),
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
            {t('dashboard.system.refresh')}
          </Button>
        )}
      </div>

      {isPending ? (
        <SystemSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage(t, error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <SystemContent data={data} />
      )}
    </section>
  );
}
