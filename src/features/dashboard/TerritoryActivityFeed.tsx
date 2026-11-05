import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashboardActivityEvent } from '@/contracts/dashboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { activityActionLabel } from './activityAction';
import { RelativeTime } from './RelativeTime';

const AUTHOR_MAX_CHARS = 24;

function truncateAuthor(author: string): string {
  return author.length > AUTHOR_MAX_CHARS ? `${author.slice(0, AUTHOR_MAX_CHARS - 1)}…` : author;
}

// Inicio may be on a projector, so the email is cut and only the tooltip shows it whole
// (SPEC FE38 §7). Focusable and tap-to-open for the same reason as RelativeTime.
function AuthorTag({ author }: { author: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const short = truncateAuthor(author);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          translate="no"
          onClick={() => setOpen(true)}
          className="inline-flex cursor-default items-center rounded-sm pointer-coarse:min-h-11 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true">{t('dashboard.activity.byAuthor', { author: short })}</span>
          <span className="sr-only">{t('dashboard.activity.byAuthor', { author })}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent translate="no" className="break-all">
        {author}
      </TooltipContent>
    </Tooltip>
  );
}

export interface TerritoryActivityFeedProps {
  items: DashboardActivityEvent[];
  windowDays: number;
}

// Events of other people link to the case detail, not the wizard: first see what happened
// (SPEC FE38 §6). `method` is support material and never rendered (F69 §8). Two lines below
// `md`: action + code on top, date + author below.
export function TerritoryActivityFeed({ items, windowDays }: TerritoryActivityFeedProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <h3 id={titleId} className="text-sm font-medium">
        {t('dashboard.activity.territory.title')}
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {t('dashboard.activity.territory.empty', { days: windowDays })}
        </p>
      ) : (
        <ol aria-labelledby={titleId}>
          {items.map((event, index) => (
            <li
              key={`${event.caseId}-${event.occurredAt}-${index}`}
              className="flex flex-wrap items-center gap-x-3 border-b py-1 last:border-b-0"
            >
              <span className="text-sm">{activityActionLabel(t, event.action)}</span>
              <Link
                to={`/esavi-cases/${event.caseId}`}
                translate="no"
                aria-label={t('dashboard.activity.territory.view', { code: event.caseCode })}
                className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {event.caseCode}
              </Link>
              <span className="flex basis-full items-center gap-x-3 pb-2 md:ml-auto md:basis-auto md:pb-0">
                <RelativeTime iso={event.occurredAt} />
                {/* null means F59 hides the author from this role — no dash, no «unknown». */}
                {event.author !== null && <AuthorTag author={event.author} />}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
