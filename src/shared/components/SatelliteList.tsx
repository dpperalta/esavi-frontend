import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HistoryIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import type { AppDetails } from '@/contracts/common';
import { getErrorMessage } from '@/shared/api/errorMessages';
import type { EsaviApiError } from '@/shared/api/types';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { cn } from '@/shared/lib/utils';

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
  // Defaults to the generic «Añadir» (SPEC FE12b §2): a list whose title alone doesn't say what
  // gets added — SPEC FE13b §3.8's «Añadir afección», next to a section that already says
  // "Afecciones médicas del recién nacido" two levels up — overrides it instead of duplicating
  // the whole component.
  addLabel?: string;
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
  // SPEC FE29 §2. An inactive row gets the `bg-destructive/5` tint and the «Eliminado» badge
  // (CONVENTIONS.md §10.1), and never offers edit or delete — only history and restore.
  isRowInactive?: (row: T) => boolean;
  // Rendered on inactive rows only. The returned promise is awaited to put focus back on the
  // restored row once the action button disappears (SPEC FE29 §3.7).
  onRestore?: (row: T) => Promise<void> | void;
  // The id of the row whose restore is in flight: its button is disabled with `aria-busy`, the
  // rest of the list stays operable (SPEC FE29 §3.6).
  restoringId?: string | null;
  // Passing it is what enables «Historial» on every row; the caller only does so for SUPERADMIN
  // (CONVENTIONS.md §10.4). The Sheet reads the cached row, never a copy (SPEC FE29 §3.4).
  getRowAppDetails?: (row: T) => AppDetails[] | null;
  onShowHistory?: (row: T) => void;
}

const SKELETON_ROWS = 3;

// The canonical pattern of CASE-PROCESS.md §5.0: title, «Añadir», rows with edit/delete, a table
// on desktop and cards below `md`. Columns and actions arrive entirely through props — this
// component imports nothing from `features/` and never learns which entity it is listing. The
// same instance backs all fourteen satellite lists of the wizard (SPEC FE12b §2, §4 paso 4).
export function SatelliteList<T>({
  titleKey,
  addLabel = 'common.satelliteList.add',
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
  isRowInactive,
  onRestore,
  restoringId,
  getRowAppDetails,
  onShowHistory,
}: SatelliteListProps<T>) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [historyRow, setHistoryRow] = useState<T | null>(null);
  const hasRowActions = !!onEdit || !!onDelete || !!onRestore || !!getRowAppDetails;

  const showHistory = getRowAppDetails
    ? (row: T) => {
        setHistoryRow(row);
        onShowHistory?.(row);
      }
    : undefined;

  // Both the table row and the card are in the DOM; only the visible one accepts focus, so each
  // is tried in turn before falling back to the list title (SPEC FE29 §3.7).
  const restore = onRestore
    ? async (row: T) => {
        await onRestore(row);
        const rowId = String(row[idField]);
        const candidates = containerRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [];
        for (const candidate of candidates) {
          if (candidate.dataset.rowId !== rowId) continue;
          candidate.focus();
          if (document.activeElement === candidate) return;
        }
        titleRef.current?.focus();
      }
    : undefined;

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 ref={titleRef} tabIndex={-1} className="text-sm font-medium text-foreground">
          {t(titleKey)}
        </h3>
        {onAdd && (
          <Button type="button" onClick={onAdd} size="sm">
            <PlusIcon aria-hidden="true" />
            {t(addLabel)}
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
                    <TableHead
                      key={column.key}
                      className={cn('h-auto py-2 align-bottom whitespace-normal', column.className)}
                    >
                      {/* The shared <Table> never wraps, so a long header ("Contacto de la persona
                          que realizó la atención inicial") set the column width on its own. The
                          block's max-width caps that, and the label breaks into two or three lines. */}
                      <span className="block max-w-44">{t(column.header)}</span>
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
                  const rowId = String(row[idField]);
                  const inactive = !!isRowInactive?.(row);
                  const isRestoring = restoringId === rowId;
                  return (
                    <TableRow
                      key={rowId}
                      data-row-id={restore ? rowId : undefined}
                      tabIndex={restore ? -1 : undefined}
                      className={cn(inactive && 'bg-destructive/5')}
                    >
                      {columns.map((column, columnIndex) => (
                        <TableCell key={column.key} className={cn('whitespace-normal', column.className)}>
                          <div className="max-w-64 break-words">
                            {column.render(row)}
                            {inactive && columnIndex === 0 && (
                              <Badge variant="destructive" className="ml-2 align-middle">
                                {t('common.satelliteList.inactiveBadge')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      ))}
                      {hasRowActions && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {showHistory && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('common.satelliteList.history', { name: label })}
                                onClick={() => showHistory(row)}
                              >
                                <HistoryIcon aria-hidden="true" />
                              </Button>
                            )}
                            {inactive && restore && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={isRestoring}
                                aria-busy={isRestoring}
                                aria-label={t('common.satelliteList.restore', { name: label })}
                                onClick={() => void restore(row)}
                              >
                                <RotateCcwIcon aria-hidden="true" />
                              </Button>
                            )}
                            {!inactive && onEdit && (
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
                            {!inactive && onDelete && (
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
            {rows.map((row) => {
              const rowId = String(row[idField]);
              const inactive = !!isRowInactive?.(row);
              return (
                <SatelliteListCard
                  key={rowId}
                  row={row}
                  rowId={restore ? rowId : undefined}
                  columns={columns}
                  label={getRowLabel(row)}
                  badge={cardBadge?.(row)}
                  inactive={inactive}
                  isRestoring={restoringId === rowId}
                  onEdit={inactive ? undefined : onEdit}
                  onDelete={inactive ? undefined : onDelete}
                  onRestore={inactive ? restore : undefined}
                  onShowHistory={showHistory}
                />
              );
            })}
          </div>
        </>
      )}

      {getRowAppDetails && (
        <SatelliteHistorySheet
          label={historyRow ? getRowLabel(historyRow) : ''}
          appDetails={historyRow ? getRowAppDetails(historyRow) : null}
          open={historyRow !== null}
          onOpenChange={(open) => {
            if (!open) setHistoryRow(null);
          }}
        />
      )}
    </div>
  );
}

interface SatelliteHistorySheetProps {
  label: string;
  appDetails: AppDetails[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Right side on desktop, the whole screen below `md` (SPEC FE29 §3.7). The width overrides use the
// same `data-[side=right]` variants as the shadcn Sheet so `cn` replaces them instead of stacking.
function SatelliteHistorySheet({ label, appDetails, open, onOpenChange }: SatelliteHistorySheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-3/4 data-[side=right]:md:max-w-sm"
      >
        <SheetHeader>
          <SheetTitle>{t('common.satelliteList.historyTitle', { name: label })}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <AuditTrail appDetails={appDetails} />
        </div>
      </SheetContent>
    </Sheet>
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
  // Only set when restore is available: it is the focus target after restoring.
  rowId?: string;
  columns: SatelliteListColumn<T>[];
  label: string;
  badge?: ReactNode;
  inactive: boolean;
  isRestoring: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onRestore?: (row: T) => Promise<void>;
  onShowHistory?: (row: T) => void;
}

function SatelliteListCard<T>({
  row,
  rowId,
  columns,
  label,
  badge,
  inactive,
  isRestoring,
  onEdit,
  onDelete,
  onRestore,
  onShowHistory,
}: SatelliteListCardProps<T>) {
  const { t } = useTranslation();
  // A column with no value for this row paints no line at all — never a dash or blank filler
  // (SPEC FE12b §3.7 and its acceptance criterion in §5).
  const cells = columns
    .map((column) => ({ column, value: column.render(row) }))
    .filter(({ value }) => value !== null && value !== undefined && value !== '');
  const primary = cells.filter(({ column }) => column.card === 'primary');
  const secondary = cells.filter(({ column }) => column.card === 'secondary');
  const meta = cells.filter(({ column }) => column.card === 'meta');

  const hasActions = !!onEdit || !!onDelete || !!onRestore || !!onShowHistory;

  return (
    <Card
      data-row-id={rowId}
      tabIndex={rowId ? -1 : undefined}
      className={cn(inactive && 'bg-destructive/5')}
    >
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {(badge || inactive) && (
            <div className="flex flex-wrap items-center gap-2">
              {badge}
              {inactive && (
                <Badge variant="destructive">{t('common.satelliteList.inactiveBadge')}</Badge>
              )}
            </div>
          )}
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
        {hasActions && (
          // 44px touch targets (SPEC FE12b §3.7) — desktop row actions stay at `icon-sm` above,
          // this is the mobile-only size.
          <div className="flex shrink-0 gap-1">
            {onShowHistory && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t('common.satelliteList.history', { name: label })}
                onClick={() => onShowHistory(row)}
              >
                <HistoryIcon aria-hidden="true" />
              </Button>
            )}
            {onRestore && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                disabled={isRestoring}
                aria-busy={isRestoring}
                aria-label={t('common.satelliteList.restore', { name: label })}
                onClick={() => void onRestore(row)}
              >
                <RotateCcwIcon aria-hidden="true" />
              </Button>
            )}
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
