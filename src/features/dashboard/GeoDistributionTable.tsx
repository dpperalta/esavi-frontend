import { useTranslation } from 'react-i18next';
import type { DashboardGeoRow } from '@/contracts/dashboard';
import { Button } from '@/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { unmappedTotal } from './geoRows';
import { useGeoDrillDown } from './useGeoDrillDown';

// Always shown next to the map, not as an alternative view: it carries what the map cannot
// (`self`, `unlocated`, units without coordinates) and is the accessible way to drill down
// (SPEC FE36c §3.7). Rows keep the server's order. `Table` wraps itself in overflow-x-auto.
export function GeoDistributionTable({ rows }: { rows: DashboardGeoRow[] }) {
  const { t, i18n } = useTranslation();
  const { drillDown } = useGeoDrillDown();
  const countFormat = new Intl.NumberFormat(i18n.language);
  const unmapped = unmappedTotal(rows);

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('dashboard.geo.columns.unit')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('dashboard.geo.columns.total')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('dashboard.geo.columns.serious')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.geoLocationId ?? `${row.kind}-${index}`}>
              <TableHead scope="row" className="h-auto py-1 font-normal whitespace-normal">
                <RowLabel row={row} onDrillDown={drillDown} />
              </TableHead>
              <TableCell className="text-right tabular-nums">
                {countFormat.format(row.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {countFormat.format(row.serious)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {unmapped > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('dashboard.geo.unmappedNote', { count: unmapped })}
        </p>
      )}
    </div>
  );
}

interface RowLabelProps {
  row: DashboardGeoRow;
  onDrillDown: (geoLocationId: string) => void;
}

function RowLabel({ row, onDrillDown }: RowLabelProps) {
  const { t } = useTranslation();

  if (row.kind === 'self') {
    return <span className="italic">{t('dashboard.geo.self')}</span>;
  }
  if (row.kind === 'unlocated' || row.geoLocationId === null) {
    return <span className="italic">{t('dashboard.geo.unlocated')}</span>;
  }

  const geoLocationId = row.geoLocationId;
  return (
    <Button
      type="button"
      variant="link"
      translate="no"
      className="h-auto min-h-9 px-0 py-1 text-left whitespace-normal pointer-coarse:min-h-11"
      aria-label={t('dashboard.geo.drillDown', { name: row.name })}
      onClick={() => onDrillDown(geoLocationId)}
    >
      {row.name}
    </Button>
  );
}
