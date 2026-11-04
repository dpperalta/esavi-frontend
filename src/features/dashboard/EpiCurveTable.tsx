import { useTranslation } from 'react-i18next';
import type { DashboardEpiWeek } from '@/contracts/dashboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { epiWeekRange } from './epiWeekRange';

const SERIES = ['serious', 'nonSerious', 'unclassified'] as const;

// Table view of the epidemic curve (SPEC FE36a §3.7): the accessible and copyable alternative to the
// chart. Not <ResourceTable>: at most 53 aggregated rows, no paging and no entity behind each row.
// `Table` already wraps itself in an overflow-x-auto container.
export function EpiCurveTable({ weeks }: { weeks: DashboardEpiWeek[] }) {
  const { t, i18n } = useTranslation();
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('dashboard.epiCurve.week')}</TableHead>
          {SERIES.map((series) => (
            <TableHead key={series} scope="col" className="text-right">
              {t(`dashboard.epiCurve.series.${series}`)}
            </TableHead>
          ))}
          <TableHead scope="col" className="text-right">
            {t('dashboard.epiCurve.total')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weeks.map((week) => (
          <TableRow key={week.label}>
            <TableHead scope="row" className="h-auto py-2 font-normal">
              <span translate="no" className="block font-medium tabular-nums">
                {week.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('dashboard.epiCurve.weekRange', epiWeekRange(week.weekStart, i18n.language))}
              </span>
              {week.partial && (
                <span className="block text-xs text-muted-foreground">
                  {t('dashboard.epiCurve.partial')}
                </span>
              )}
            </TableHead>
            {SERIES.map((series) => (
              <TableCell key={series} className="text-right tabular-nums">
                {countFormat.format(week[series])}
              </TableCell>
            ))}
            <TableCell className="text-right font-medium tabular-nums">
              {countFormat.format(week.total)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
