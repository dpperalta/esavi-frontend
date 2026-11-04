import { useTranslation } from 'react-i18next';
import type { DashboardDistributions } from '@/contracts/dashboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { cn } from '@/shared/lib/utils';

// Table view of the suspected vaccines (SPEC FE36b §3.7): the full name of every row, copyable,
// with «Codificada» spelled out. `Table` already wraps itself in an overflow-x-auto container.
export function VaccinesTable({ data }: { data: DashboardDistributions['vaccines'] }) {
  const { t, i18n } = useTranslation();
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('dashboard.vaccines.columns.vaccine')}</TableHead>
          <TableHead scope="col">{t('dashboard.vaccines.columns.coded')}</TableHead>
          <TableHead scope="col" className="text-right">
            {t('dashboard.vaccines.columns.cases')}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t('dashboard.vaccines.columns.serious')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((item) => (
          <TableRow key={item.key}>
            <TableHead
              scope="row"
              className={cn(
                'h-auto py-2 font-normal whitespace-normal',
                (!item.coded || item.label === null) && 'italic',
              )}
            >
              {item.label ?? t('dashboard.vaccines.noLabel')}
            </TableHead>
            <TableCell>
              {t(item.coded ? 'common.answerOption.yes' : 'common.answerOption.no')}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {countFormat.format(item.cases)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {countFormat.format(item.serious)}
            </TableCell>
          </TableRow>
        ))}
        {data.others.cases > 0 && (
          <TableRow>
            <TableHead scope="row" className="h-auto py-2 font-normal">
              {t('dashboard.vaccines.others')}
            </TableHead>
            {/* `others` mixes coded and free-text rows, so it has no single answer here. */}
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {countFormat.format(data.others.cases)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {countFormat.format(data.others.serious)}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
