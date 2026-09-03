import { useTranslation } from 'react-i18next';
import type { GeoEntityCounters, GeoImportReport as GeoImportReportData } from '@/contracts/geoImport';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

export interface GeoImportReportProps {
  report: GeoImportReportData;
}

const TREE_MOVE_REASONS = new Set(['PARENT_CHANGED', 'LEVEL_CHANGED', 'LOCATION_CHANGED']);

interface SheetView {
  key: 'geoLocation' | 'healthFacility';
  titleKey: string;
  present: boolean;
  counters: GeoEntityCounters & { sortOrderCoerced?: number };
  shownErrors: number;
  missingOptionalHeaders: string[];
  unknownHeaders: string[];
}

// Pure by design (SPEC FE07 §4 paso 6): takes the `006` report and paints it, calls nothing.
// The mutation's `useMutation().data` is what feeds this — never copied to a `useState`.
export function GeoImportReport({ report }: GeoImportReportProps) {
  const { t } = useTranslation();

  const sheets: SheetView[] = [
    {
      key: 'geoLocation',
      titleKey: 'geoBulkImport.report.sheetGeoLocation',
      present: true,
      counters: report.geoLocation,
      shownErrors: report.errors.filter((error) => error.sheet === 'geoLocation').length,
      missingOptionalHeaders: report.missingOptionalHeaders.geoLocation,
      unknownHeaders: report.unknownHeaders.geoLocation,
    },
    {
      key: 'healthFacility',
      titleKey: 'geoBulkImport.report.sheetHealthFacility',
      present: report.sheets.healthFacility !== null,
      counters: report.healthFacility,
      shownErrors: report.errors.filter((error) => error.sheet === 'healthFacility').length,
      missingOptionalHeaders: report.missingOptionalHeaders.healthFacility,
      unknownHeaders: report.unknownHeaders.healthFacility,
    },
  ];

  const presentSheets = sheets.filter((sheet) => sheet.present);
  const totalInactiveMatched = presentSheets.reduce(
    (sum, sheet) => sum + sheet.counters.inactiveMatched,
    0,
  );
  const hasTreeMoves = report.errors.some((error) => TREE_MOVE_REASONS.has(error.reason));
  const orphanCount = report.errors.filter((error) => error.reason === 'ORPHAN').length;
  const allUnchanged = presentSheets.every(
    (sheet) => sheet.counters.inserted === 0 && sheet.counters.updated === 0,
  );

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <h2 className="font-heading text-lg font-medium">{t('geoBulkImport.report.title')}</h2>

      {report.dryRun && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('geoBulkImport.report.dryRunNotice')}
        </p>
      )}

      {allUnchanged && (
        <p className="text-sm text-muted-foreground">{t('geoBulkImport.report.allUnchanged')}</p>
      )}

      {totalInactiveMatched > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('geoBulkImport.report.warnInactiveMatched', { count: totalInactiveMatched })}
        </p>
      )}

      {hasTreeMoves && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('geoBulkImport.report.warnTreeMoves')}
        </p>
      )}

      {orphanCount > 0 && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {t('geoBulkImport.report.infoOrphans', { count: orphanCount })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {sheets.map((sheet) => (
          <SheetCounters key={sheet.key} sheet={sheet} />
        ))}
      </div>

      <ErrorsTable errors={report.errors} />
    </div>
  );
}

function SheetCounters({ sheet }: { sheet: SheetView }) {
  const { t } = useTranslation();

  if (!sheet.present) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t(sheet.titleKey)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('geoBulkImport.report.sheetMissing')}</p>
        </CardContent>
      </Card>
    );
  }

  const { counters } = sheet;
  const entries: Array<[string, number]> = [
    ['read', counters.read],
    ['inserted', counters.inserted],
    ['updated', counters.updated],
    ['unchanged', counters.unchanged],
    ['invalid', counters.invalid],
    ['duplicated', counters.duplicated],
    ['inactiveMatched', counters.inactiveMatched],
  ];
  if (counters.sortOrderCoerced !== undefined) {
    entries.push(['sortOrderCoerced', counters.sortOrderCoerced]);
  }
  const isTruncated = sheet.shownErrors < counters.invalid;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(sheet.titleKey)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3">
          {entries.map(([counterKey, value]) => (
            <div key={counterKey}>
              <dt className="text-xs text-muted-foreground">
                {t(`geoBulkImport.report.counters.${counterKey}`)}
              </dt>
              <dd className="font-heading text-lg font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {isTruncated && (
          <p className="text-xs text-muted-foreground">
            {t('geoBulkImport.report.errorsTruncated', {
              shown: sheet.shownErrors,
              total: counters.invalid,
            })}
          </p>
        )}
        {sheet.missingOptionalHeaders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('geoBulkImport.report.missingOptionalHeaders')}: {sheet.missingOptionalHeaders.join(', ')}
          </p>
        )}
        {sheet.unknownHeaders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('geoBulkImport.report.unknownHeaders')}: {sheet.unknownHeaders.join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorsTable({ errors }: { errors: GeoImportReportData['errors'] }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-heading text-base font-medium">{t('geoBulkImport.report.errorsTitle')}</h3>

      {errors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('geoBulkImport.report.errorsEmpty')}</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader className="bg-primary/8">
                <TableRow>
                  <TableHead>{t('geoBulkImport.report.columnReason')}</TableHead>
                  <TableHead>{t('geoBulkImport.report.columnSheet')}</TableHead>
                  <TableHead>{t('geoBulkImport.report.columnRow')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((error, index) => (
                  <TableRow key={`${error.sheet}-${error.row}-${index}`}>
                    <TableCell>{reasonLabel(error, t)}</TableCell>
                    <TableCell>{sheetLabel(error.sheet, t)}</TableCell>
                    <TableCell>{error.row}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {errors.map((error, index) => (
              <Card key={`${error.sheet}-${error.row}-${index}`}>
                <CardContent className="flex flex-col gap-1">
                  <div className="font-medium text-foreground">{reasonLabel(error, t)}</div>
                  <div className="text-sm text-muted-foreground">
                    {sheetLabel(error.sheet, t)} · {error.row}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function sheetLabel(sheet: 'geoLocation' | 'healthFacility', t: (key: string) => string): string {
  return sheet === 'geoLocation'
    ? t('geoBulkImport.report.sheetGeoLocation')
    : t('geoBulkImport.report.sheetHealthFacility');
}

function reasonLabel(
  error: GeoImportReportData['errors'][number],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const reason = t(`geoBulkImport.reasons.${error.reason}`);
  if (error.reason === 'VALUE_TOO_LONG' && error.column) {
    return reason + t('geoBulkImport.report.columnHint', { column: error.column });
  }
  return reason;
}
