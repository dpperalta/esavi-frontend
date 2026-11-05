import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashboardMyCase } from '@/contracts/dashboard';
import { activityActionLabel } from './activityAction';
import { RelativeTime } from './RelativeTime';
import { statusLabel } from './statusLabel';

export interface MyCasesListProps {
  items: DashboardMyCase[];
  windowDays: number;
}

// Rows link to the wizard without `:step`, which resumes the case where it stopped
// (SPEC FE08 §4, FE38 §6). Two lines below `md`: code + date on top, status + action below.
export function MyCasesList({ items, windowDays }: MyCasesListProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <h3 id={titleId} className="text-sm font-medium">
        {t('dashboard.activity.myCases.title')}
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {t('dashboard.activity.myCases.empty', { days: windowDays })}
        </p>
      ) : (
        <ol aria-labelledby={titleId}>
          {items.map((item) => (
            <li
              key={item.caseId}
              className="flex flex-wrap items-center gap-x-3 border-b py-1 last:border-b-0"
            >
              <Link
                to={`/esavi-cases/${item.caseId}/wizard`}
                translate="no"
                aria-label={t('dashboard.activity.myCases.resume', { code: item.caseCode })}
                className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {item.caseCode}
              </Link>
              {/* No statusName arrives with a my-case row, so an unknown code shows as is (§3.6). */}
              <span className="order-last basis-full pb-2 text-sm text-muted-foreground md:order-none md:basis-auto md:pb-0">
                {statusLabel(t, item.statusCode, item.statusCode)}
                {' · '}
                {activityActionLabel(t, item.lastAction)}
              </span>
              <span className="ml-auto">
                <RelativeTime iso={item.lastActionAt} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
