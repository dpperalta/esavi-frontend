import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { DiagnosticTermImportReport as DiagnosticTermImportReportData } from '@/contracts/diagnosticTerm';
import { Button } from '@/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

export interface DiagnosticTermImportReportProps {
  report: DiagnosticTermImportReportData;
  ref?: Ref<HTMLElement>;
}

const COUNTER_KEYS = ['read', 'inserted', 'updated', 'unchanged', 'invalid', 'duplicated'] as const;

// Pure by design (SPEC FE25b §4 paso 5): paints the 007 report and calls nothing. It is fed by
// `useMutation().data`, never by a `useState` copy. `tabIndex={-1}` lets the page move focus here
// when the report arrives (§3.7).
export function DiagnosticTermImportReport({ report, ref }: DiagnosticTermImportReportProps) {
  const { t } = useTranslation();
  const isTruncated = report.invalid + report.duplicated > report.errors.length;

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="diagnostic-term-import-report-title"
      className="flex min-w-0 flex-col gap-4 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <h2 id="diagnostic-term-import-report-title" className="font-heading text-lg font-medium">
        {t('diagnosticTerm.import.report.title')}
      </h2>

      {report.dryRun && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('diagnosticTerm.import.report.dryRunNotice')}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        {COUNTER_KEYS.map((counterKey) => (
          <div key={counterKey} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">
              {t(`diagnosticTerm.import.report.${counterKey}`)}
            </dt>
            <dd className="font-heading text-lg font-medium tabular-nums">{report[counterKey]}</dd>
          </div>
        ))}
      </dl>

      {isTruncated && (
        <p className="text-xs text-muted-foreground">
          {t('diagnosticTerm.import.report.truncatedNotice')}
        </p>
      )}

      {report.errors.length > 0 && (
        // §3.7: the rejections table scrolls inside this container, never the body.
        <div className="min-w-0 overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-primary/8">
              <TableRow>
                <TableHead className="w-16">
                  {t('diagnosticTerm.import.report.columns.line')}
                </TableHead>
                <TableHead>{t('diagnosticTerm.import.report.columns.reason')}</TableHead>
                <TableHead>{t('diagnosticTerm.import.report.columns.raw')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.errors.map((error) => (
                <TableRow key={`${error.line}-${error.reason}`}>
                  <TableCell className="tabular-nums">{error.line}</TableCell>
                  <TableCell>{t(`diagnosticTerm.import.reasons.${error.reason}`)}</TableCell>
                  <TableCell className="max-w-[28rem] truncate font-mono text-xs" title={error.raw}>
                    {error.raw}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!report.dryRun && (
        <div>
          <Button asChild variant="outline" size="touch">
            <Link to="/diagnostic-terms">{t('diagnosticTerm.import.report.viewTerms')}</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
