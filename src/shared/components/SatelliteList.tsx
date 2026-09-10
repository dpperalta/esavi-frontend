import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { getErrorMessage } from '@/shared/api/errorMessages';
import type { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

export interface SatelliteListColumn<T> {
  key: string;
  // i18n key, resolved by the table header — never a literal (CONVENTIONS.md §2).
  header: string;
  // A `null`/`undefined`/`''` return means this row has no value for the column: the desktop
  // table still renders the empty cell, but the mobile card skips the line entirely (SPEC FE12b
  // §3.7) — no dash, no filler.
  render: (row: T) => ReactNode;
  card?: 'primary' | 'secondary' | 'meta';
  className?: string;
}

export interface SatelliteListProps<T> {
  titleKey: string;
  columns: SatelliteListColumn<T>[];
  rows: T[];
  idField: keyof T;
  // Feeds the row-specific `aria-label` of the two actions — "Eliminar Fiebre alta", never
  // "Eliminar" (SPEC FE12b §3.7) — and the delete confirmation dialog the caller opens on
  // `onDelete`.
  getRowLabel: (row: T) => string;
  // A visual marker on the mobile card that isn't one of its enumerable fields — the "distintivo
  // visual" of SPEC FE12c §3.7 ("sospechosa" on `<VaccineList>`): a `null` return paints nothing,
  // same convention as `column.render`. Desktop shows the same thing through an ordinary column
  // with no `card` group instead — this prop only exists for the card, which unlike the table
  // doesn't render every column unconditionally.
  cardBadge?: (row: T) => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  error?: EsaviApiError | null;
  onRetry?: () => void;
  // Omitted entirely — not just disabled — for a closed case: SPEC FE12b §3.6 wants no «Añadir»
  // and no row actions in the DOM, not a greyed-out button.
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
}

const SKELETON_ROWS = 3;

// The canonical pattern of CASE-PROCESS.md §5.0: title, «Añadir», rows with edit/delete, a table
// on desktop and cards below `md`. Columns and actions arrive entirely through props — this
// component imports nothing from `features/` and never learns which entity it is listing. The
// same instance backs all fourteen satellite lists of the wizard (SPEC FE12b §2, §4 paso 4).
export function SatelliteList<T>({
  titleKey,
  columns,
  rows,
  idField,
  getRowLabel,
  cardBadge,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  onAdd,
  onEdit,
  onDelete,
}: SatelliteListProps<T>) {
  const { t } = useTranslation();
  const hasRowActions = !!onEdit || !!onDelete;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 tabIndex={-1} className="text-sm font-medium text-foreground">{t(titleKey)}</h3>
        {onAdd && (
          <Button type="button" onClick={onAdd} size="sm">
            <PlusIcon aria-hidden="true" />
            {t('common.satelliteList.add')}
          </Button>
        )}
      </div>

      {isLoading && <SatelliteListSkeleton columns={columns} />}

      {!isLoading && isError && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-destructive">
            {error ? getErrorMessage(error) : t('common.errors.unexpected')}
          </p>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('common.table.retry')}
            </Button>
          )}
        </div>
      )}

      {/* An empty list carries no illustration and no empty-state text (CASE-PROCESS.md §5.0):
          four lists in step 4 and ten in step 5 saying the same thing would be nothing but noise.
          Title and «Añadir» above already say what this is and what to do. */}
      {!isLoading && !isError && rows.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader className="bg-primary/8">
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.key} className={column.className}>
                      {t(column.header)}
                    </TableHead>
                  ))}
                  {hasRowActions && (
                    <TableHead className="w-20">
                      <span className="sr-only">{t('common.table.rowActions')}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const label = getRowLabel(row);
                  return (
                    <TableRow key={String(row[idField])}>
                      {columns.map((column) => (
                        <TableCell key={column.key} className={column.className}>
                          {column.render(row)}
                        </TableCell>
                      ))}
                      {hasRowActions && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {onEdit && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('common.satelliteList.edit', { name: label })}
                                onClick={() => onEdit(row)}
                              >
                                <PencilIcon aria-hidden="true" />
                              </Button>
                            )}
                            {onDelete && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                aria-label={t('common.satelliteList.delete', { name: label })}
                                onClick={() => onDelete(row)}
                              >
                                <Trash2Icon aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <SatelliteListCard
                key={String(row[idField])}
                row={row}
                columns={columns}
                label={getRowLabel(row)}
                badge={cardBadge?.(row)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface SatelliteListSkeletonProps<T> {
  columns: SatelliteListColumn<T>[];
}

function SatelliteListSkeleton<T>({ columns }: SatelliteListSkeletonProps<T>) {
  const skeletonRows = Array.from({ length: SKELETON_ROWS });

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader className="bg-primary/8">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className} />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skeletonRows.map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 md:hidden">
        {skeletonRows.map((_, rowIndex) => (
          <Card key={rowIndex}>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

interface SatelliteListCardProps<T> {
  row: T;
  columns: SatelliteListColumn<T>[];
  label: string;
  badge?: ReactNode;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
}

function SatelliteListCard<T>({ row, columns, label, badge, onEdit, onDelete }: SatelliteListCardProps<T>) {
  const { t } = useTranslation();
  // A column with no value for this row paints no line at all — never a dash or blank filler
  // (SPEC FE12b §3.7 and its acceptance criterion in §5).
  const cells = columns
    .map((column) => ({ column, value: column.render(row) }))
    .filter(({ value }) => value !== null && value !== undefined && value !== '');
  const primary = cells.filter(({ column }) => column.card === 'primary');
  const secondary = cells.filter(({ column }) => column.card === 'secondary');
  const meta = cells.filter(({ column }) => column.card === 'meta');

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {badge && <div>{badge}</div>}
          {primary.map(({ column, value }) => (
            <div key={column.key} className="font-medium text-foreground">
              {value}
            </div>
          ))}
          {secondary.map(({ column, value }) => (
            <div key={column.key} className="text-sm text-muted-foreground">
              {value}
            </div>
          ))}
          {meta.length > 0 && (
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {meta.map(({ column, value }) => (
                <span key={column.key}>{value}</span>
              ))}
            </div>
          )}
        </div>
        {(onEdit || onDelete) && (
          // 44px touch targets (SPEC FE12b §3.7) — desktop row actions stay at `icon-sm` above,
          // this is the mobile-only size.
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t('common.satelliteList.edit', { name: label })}
                onClick={() => onEdit(row)}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive hover:text-destructive"
                aria-label={t('common.satelliteList.delete', { name: label })}
                onClick={() => onDelete(row)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
