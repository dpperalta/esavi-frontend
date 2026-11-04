import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import type { SexAgeRow } from './sexAgeRows';

const COLUMNS = [
  { code: 'FEMALE', field: 'female' },
  { code: 'MALE', field: 'male' },
  { code: 'UNKNOWN', field: 'unknown' },
  { code: 'NONE', field: 'none' },
] as const;

// Table view of the pyramid (SPEC FE36b §3.7): the full 9 × 4 matrix, UNKNOWN and NONE included,
// with the total per band. `Table` already wraps itself in an overflow-x-auto container.
export function SexAgeTable({ rows }: { rows: SexAgeRow[] }) {
  const { t, i18n } = useTranslation();
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('dashboard.sexAge.bandColumn')}</TableHead>
          {COLUMNS.map(({ code }) => (
            <TableHead key={code} scope="col" className="text-right">
              {t(`dashboard.sexAge.sex.${code}`)}
            </TableHead>
          ))}
          <TableHead scope="col" className="text-right">
            {t('dashboard.sexAge.total')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.band}>
            <TableHead scope="row" className="h-auto py-2 font-normal">
              {t(`dashboard.sexAge.band.${row.band}`)}
            </TableHead>
            {COLUMNS.map(({ code, field }) => (
              <TableCell key={code} className="text-right tabular-nums">
                {countFormat.format(row[field])}
              </TableCell>
            ))}
            <TableCell className="text-right font-medium tabular-nums">
              {countFormat.format(row.total)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
