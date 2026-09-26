import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

export interface ImportReportCounters {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
  invalid: number;
  duplicated: number;
}

export interface ImportReportColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface ImportReportProps<T> {
  counters: ImportReportCounters;
  dryRun: boolean;
  rejected: T[];
  rejectedColumns: ImportReportColumn<T>[];
  children?: ReactNode;
}

const COUNTER_KEYS = ['read', 'inserted', 'updated', 'unchanged', 'invalid', 'duplicated'] as const;

// Pure by design (SPEC FE25c §3.9): paints a finished import report and calls nothing. Each
// consumer translates its own rejection reasons inside `render`, so the primitive never learns
// the reason codes of any particular import.
export function ImportReport<T>({
  counters,
  dryRun,
  rejected,
  rejectedColumns,
  children,
}: ImportReportProps<T>) {
  const { t } = useTranslation();
  const titleId = useId();
  const rejectedTitleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The backend truncates the rejections to 20; the counters keep the real totals.
  const isTruncated = counters.invalid + counters.duplicated > rejected.length;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <h2
        ref={titleRef}
        id={titleId}
        tabIndex={-1}
        aria-live="polite"
        className="rounded-md font-heading text-lg font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t('common.importReport.title')}
      </h2>

      {dryRun && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('common.importReport.dryRunNotice')}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        {COUNTER_KEYS.map((counterKey) => (
          <div key={counterKey} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">
              {t(`common.importReport.${counterKey}`)}
            </dt>
            <dd className="font-heading text-lg font-medium tabular-nums">
              {counters[counterKey]}
            </dd>
          </div>
        ))}
      </dl>

      {children}

      <div className="flex min-w-0 flex-col gap-2">
        <h3 id={rejectedTitleId} className="text-sm font-medium">
          {t('common.importReport.rejectedTitle')}
        </h3>

        {rejected.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common.importReport.noRejected')}</p>
        ) : (
          <>
            {isTruncated && (
              <p className="text-xs text-muted-foreground">
                {t('common.importReport.truncatedNotice')}
              </p>
            )}
            {/* The inner table container scrolls horizontally; this one only clips the corners. */}
            <div className="min-w-0 overflow-hidden rounded-xl border">
              <Table aria-labelledby={rejectedTitleId}>
                <TableHeader className="bg-primary/8">
                  <TableRow>
                    {rejectedColumns.map((column) => (
                      <TableHead key={column.key}>{column.header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejected.map((row, rowIndex) => (
                    // Rejections have no identity of their own and never reorder.
                    <TableRow key={rowIndex}>
                      {rejectedColumns.map((column) => (
                        <TableCell key={column.key}>{column.render(row)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
