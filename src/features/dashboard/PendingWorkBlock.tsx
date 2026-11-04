import { type ReactNode, useId } from 'react';
import type { TFunction } from 'i18next';
import { RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  DashboardPendingInvestigation,
  DashboardPendingWork,
  DashboardStalledCase,
  DashboardStatusCount,
} from '@/contracts/dashboard';
import type { CaseWorkflowStatusCode } from '@/contracts/declared/caseWorkflow';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { usePendingWork } from './api';
import { getPendingWorkLayout, type PendingWorkList } from './pendingWorkLayout';
import { statusLabel } from './statusLabel';

const CLOSED_STATUS = 'CLOSED';

const linkFocusClass =
  'rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

// Stalled and pending rows carry `statusCode` without `statusName`; the funnel row of the same
// code is the Spanish fallback for a state the client does not know yet (F65 §8).
function statusLabelFrom(t: TFunction, funnel: DashboardStatusCount[], code: string): string {
  const row = funnel.find((entry) => entry.statusCode === code);
  return statusLabel(t, code, row?.statusName ?? code);
}

function FunnelCard({ entry, emphasized }: { entry: DashboardStatusCount; emphasized: boolean }) {
  const { t } = useTranslation();
  const label = statusLabel(t, entry.statusCode, entry.statusName);

  return (
    <Link
      to={`/esavi-cases?statusCode=${encodeURIComponent(entry.statusCode)}`}
      aria-label={t('dashboard.pendingWork.funnel.cardLabel', { status: label, count: entry.count })}
      className={cn(
        linkFocusClass,
        'flex h-full min-h-11 flex-col justify-between gap-1 border bg-background p-3 transition-colors hover:bg-muted',
        emphasized && 'bg-primary/8 ring-2 ring-primary hover:bg-primary/12',
      )}
    >
      <span className="text-2xl font-semibold tabular-nums">{entry.count}</span>
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
    </Link>
  );
}

function Funnel({
  funnel,
  emphasizedStatuses,
}: {
  funnel: DashboardStatusCount[];
  emphasizedStatuses: ReadonlySet<CaseWorkflowStatusCode>;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const sorted = [...funnel].sort((a, b) => a.sortOrder - b.sortOrder);
  const open = sorted.filter((entry) => entry.statusCode !== CLOSED_STATUS);
  const closed = sorted.filter((entry) => entry.statusCode === CLOSED_STATUS);
  const isEmphasized = (code: string) => emphasizedStatuses.has(code as CaseWorkflowStatusCode);
  const renderCard = (entry: DashboardStatusCount) => (
    <li key={entry.statusCode}>
      <FunnelCard entry={entry} emphasized={isEmphasized(entry.statusCode)} />
    </li>
  );

  return (
    <div className="flex flex-col gap-2">
      <h3 id={titleId} className="text-sm font-medium">
        {t('dashboard.pendingWork.funnel.title')}
      </h3>
      {/* 2 columns below md; from md, seven open states, a 1px divider and CLOSED (§3.7). */}
      <ul
        aria-labelledby={titleId}
        className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(7,minmax(0,1fr))_1px_minmax(0,1fr)]"
      >
        {open.map(renderCard)}
        {closed.length > 0 && <li aria-hidden="true" className="hidden bg-border md:block" />}
        {closed.map(renderCard)}
      </ul>
    </div>
  );
}

function CaseCodeLink({ caseId, caseCode }: { caseId: string; caseCode: string }) {
  return (
    <Link
      to={`/esavi-cases/${caseId}/wizard`}
      translate="no"
      className={cn(linkFocusClass, 'inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline')}
    >
      {caseCode}
    </Link>
  );
}

// Two lines at 375px (code + days on top, status + stage below); one line from `sm` (§3.7).
function CaseRow({ caseLink, meta, days }: { caseLink: ReactNode; meta: string; days: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 border-b py-1 last:border-b-0">
      {caseLink}
      <span className="order-last basis-full pb-2 text-sm text-muted-foreground sm:order-none sm:basis-auto sm:pb-0">
        {meta}
      </span>
      <span className="ml-auto text-sm tabular-nums">{days}</span>
    </li>
  );
}

function ListSection({
  title,
  total,
  itemCount,
  emptyMessage,
  children,
}: {
  title: string;
  total: number;
  itemCount: number;
  emptyMessage: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <h3 id={titleId} className="text-sm font-medium">
        {title}
      </h3>
      {itemCount === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul aria-labelledby={titleId}>{children}</ul>
      )}
      {/* Plain secondary text, never link-styled: no route lists them all yet (SPEC FE34 §2, §7). */}
      {total > itemCount && (
        <p className="pt-1 text-sm text-muted-foreground">
          {t('dashboard.pendingWork.more', { count: total - itemCount })}
        </p>
      )}
    </div>
  );
}

function StalledList({ data }: { data: DashboardPendingWork }) {
  const { t } = useTranslation();
  const { staleDays, total, items } = data.stalled;

  // staleDays < 1 means detection is switched off (F65 §8) — not the same as «nothing stalled».
  if (staleDays < 1) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border p-3">
        <h3 className="text-sm font-medium">{t('dashboard.pendingWork.stalled.title')}</h3>
        <p className="py-2 text-sm text-muted-foreground">{t('dashboard.pendingWork.stalled.disabled')}</p>
      </div>
    );
  }

  return (
    <ListSection
      title={t('dashboard.pendingWork.stalled.title')}
      total={total}
      itemCount={items.length}
      emptyMessage={t('dashboard.pendingWork.stalled.empty', { days: staleDays })}
    >
      {items.map((item: DashboardStalledCase) => {
        const status = statusLabelFrom(t, data.funnel, item.statusCode);
        const meta = item.openStage ? `${status} · ${t(`caseWorkflow.stage.${item.openStage}`)}` : status;
        return (
          <CaseRow
            key={item.caseId}
            caseLink={<CaseCodeLink caseId={item.caseId} caseCode={item.caseCode} />}
            meta={meta}
            days={t('dashboard.pendingWork.stalled.days', { count: item.daysStalled })}
          />
        );
      })}
    </ListSection>
  );
}

function PendingInvestigationsList({ data }: { data: DashboardPendingWork }) {
  const { t } = useTranslation();
  const { total, items } = data.pendingInvestigations;

  return (
    <ListSection
      title={t('dashboard.pendingWork.pendingInvestigations.title')}
      total={total}
      itemCount={items.length}
      emptyMessage={t('dashboard.pendingWork.pendingInvestigations.empty')}
    >
      {items.map((item: DashboardPendingInvestigation) => (
        <CaseRow
          key={item.caseId}
          caseLink={<CaseCodeLink caseId={item.caseId} caseCode={item.caseCode} />}
          meta={statusLabelFrom(t, data.funnel, item.statusCode)}
          days={t('dashboard.pendingWork.pendingInvestigations.days', { count: item.daysWaiting })}
        />
      ))}
    </ListSection>
  );
}

const LIST_COMPONENTS: Record<PendingWorkList, (props: { data: DashboardPendingWork }) => ReactNode> = {
  stalled: StalledList,
  pendingInvestigations: PendingInvestigationsList,
};

function PendingWorkSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-56" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-18" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, list) => (
          <div key={list} className="flex flex-col gap-2 rounded-lg border p-3">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 3 }, (_, row) => (
              <Skeleton key={row} className="h-8" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function errorMessage(t: TFunction, error: unknown): string {
  return error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
    ? t('errors.network')
    : t('dashboard.pendingWork.error');
}

export interface PendingWorkBlockProps {
  // Effective role from ESAVI-USER-007, resolved by HomePage — only used for order and emphasis.
  roleName: string | null;
}

// ESAVI-DASH-006 via usePendingWork (SPEC FE34). Every state stays inside the section, so the
// greeting above it is never replaced by a loading or error screen.
export function PendingWorkBlock({ roleName }: PendingWorkBlockProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { data, isPending, isError, error, isFetching, refetch } = usePendingWork();
  const layout = getPendingWorkLayout(roleName);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isFetching}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-medium">
            {t('dashboard.pendingWork.title')}
          </h2>
          {data && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {t('dashboard.pendingWork.openCases', { count: data.openCases })}
              {' · '}
              {t('dashboard.pendingWork.reopened', { count: data.reopened.total })}
              {' · '}
              {t('dashboard.pendingWork.updatedAt', { time: formatTime(data.generatedAt, i18n.language) })}
            </p>
          )}
        </div>
        {data && !isError && (
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCwIcon aria-hidden="true" className={cn(isFetching && 'motion-safe:animate-spin')} />
            {t('dashboard.pendingWork.refresh')}
          </Button>
        )}
      </div>

      {isPending ? (
        <PendingWorkSkeleton />
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
        <p className="rounded-lg border bg-muted p-3 text-sm">{t('dashboard.pendingWork.noAssignments')}</p>
      ) : (
        <>
          <Funnel funnel={data.funnel} emphasizedStatuses={layout.emphasizedStatuses} />
          <div className="grid gap-4 lg:grid-cols-2">
            {layout.listOrder.map((list) => {
              const ListComponent = LIST_COMPONENTS[list];
              return <ListComponent key={list} data={data} />;
            })}
          </div>
        </>
      )}
    </section>
  );
}
