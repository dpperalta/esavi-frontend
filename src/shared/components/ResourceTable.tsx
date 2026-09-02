import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxIcon, MoreVerticalIcon, PlusIcon } from 'lucide-react';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { InactiveMode } from '@/shared/api/createResource';
import { getErrorMessage } from '@/shared/api/errorMessages';
import type { EsaviApiError } from '@/shared/api/types';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { useCan } from '@/shared/hooks/useCan';
import { cn } from '@/shared/lib/utils';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface ResourceTableColumn<T> {
  key: string;
  // i18n key, resolved by the table — never a literal (CONVENTIONS.md §2).
  header: string;
  render: (row: T) => ReactNode;
  // Which mobile card slot this column's value falls into (SPEC FE02 §3.9). Columns without a
  // `card` don't appear in the collapsed view — taking "the first three columns" would tie the
  // card to the desktop column order.
  card?: 'primary' | 'secondary' | 'meta';
  className?: string;
}

export interface ResourceTableProps<T> {
  columns: ResourceTableColumn<T>[];
  data: PaginatedResponse<T> | undefined;
  idField: keyof T;
  isLoading: boolean;
  isError: boolean;
  error?: EsaviApiError | null;
  onRetry: () => void;
  page: number;
  onPageChange: (page: number) => void;
  inactiveMode: InactiveMode;
  includeInactive?: boolean;
  onIncludeInactiveChange?: (value: boolean) => void;
  rowActions?: (row: T) => ReactNode;
  onCreate?: () => void;
  canCreate?: boolean;
  emptyKey?: string;
  emptyFilteredKey?: string;
  isFiltered?: boolean;
  // Shown as a "Limpiar filtros" button on the filtered-empty state (SPEC FE04 §3.8) — a generic
  // capability, not specific to any one entity.
  onClearFilters?: () => void;
  // Hallazgo E (SPEC FE02 §1): declared for the API contract every entity will share, but
  // inert until a backend listing supports it (CONVENTIONS.md §6.5 forbids sorting/filtering
  // in memory). FE03 is the first to pass `true`.
  searchable?: boolean;
  sortable?: boolean;
  // CONVENTIONS.md §10.1: an inactive row gets a `destructive` background tint on top of its
  // status badge — the badge alone made an inactive row too easy to miss scanning a dense table.
  // Optional because `T` is generic; a caller without an `isActive`-shaped field just never
  // passes it.
  isRowInactive?: (row: T) => boolean;
}

export function ResourceTable<T>({
  columns,
  data,
  idField,
  isLoading,
  isError,
  error,
  onRetry,
  page,
  onPageChange,
  inactiveMode,
  includeInactive = false,
  onIncludeInactiveChange,
  rowActions,
  onCreate,
  canCreate = false,
  emptyKey = 'common.table.empty',
  emptyFilteredKey = 'common.table.emptyFiltered',
  isFiltered = false,
  onClearFilters,
  isRowInactive,
}: ResourceTableProps<T>) {
  const { t } = useTranslation();
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const setPageSize = usePreferencesStore((state) => state.setPageSize);
  // Hallazgo C: the `/admin` route always requires ADMIN, regardless of what the backend's
  // `canViewInactive` checks — the toggle's visibility follows that route, not the entity.
  const canViewAdminToggle = useCan(ROLE_LEVELS.ADMIN);
  const canViewServerDecidesNote = useCan(ROLE_LEVELS.SUPERADMIN);

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const showToggle =
    inactiveMode === 'adminPath' && canViewAdminToggle && !!onIncludeInactiveChange;
  const showServerDecidesNote = inactiveMode === 'serverDecides' && canViewServerDecidesNote;

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    onPageChange(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {showToggle && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={includeInactive}
                onCheckedChange={onIncludeInactiveChange}
                aria-label={t('common.table.showInactive')}
              />
              <span className="text-muted-foreground">{t('common.table.showInactive')}</span>
            </label>
          )}
          {showServerDecidesNote && (
            <p className="text-sm text-muted-foreground">
              {t('common.table.serverDecidesInactive')}
            </p>
          )}
        </div>

        {onCreate && canCreate && (
          <Button type="button" onClick={onCreate} size="sm">
            <PlusIcon aria-hidden="true" />
            {t('common.actions.create')}
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {isLoading && <ResourceTableSkeleton columns={columns} pageSize={pageSize} />}

        {!isLoading && isError && (
          <ResourceTableError
            message={error ? getErrorMessage(error) : t('common.errors.unexpected')}
            onRetry={onRetry}
          />
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <ResourceTableEmpty
            messageKey={isFiltered ? emptyFilteredKey : emptyKey}
            onCreate={canCreate ? onCreate : undefined}
            onClearFilters={isFiltered ? onClearFilters : undefined}
          />
        )}

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
                    {rowActions && (
                      <TableHead className="w-10">
                        <span className="sr-only">{t('common.table.rowActions')}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={String(row[idField])}
                      className={cn(isRowInactive?.(row) && 'bg-destructive/5')}
                    >
                      {columns.map((column) => (
                        <TableCell key={column.key} className={column.className}>
                          {column.render(row)}
                        </TableCell>
                      ))}
                      {rowActions && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('common.table.rowActions')}
                              >
                                <MoreVerticalIcon aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">{rowActions(row)}</DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {rows.map((row) => (
                <ResourceTableCard
                  key={String(row[idField])}
                  row={row}
                  columns={columns}
                  rowActions={rowActions}
                  isInactive={isRowInactive?.(row)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {!isLoading && !isError && count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="resource-table-page-size" className="text-sm text-muted-foreground">
              {t('common.table.pageSize')}
            </Label>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              {/* SPEC FE05 §3.3, excepción 1: an empty pageSize has no state <ResourceTable> knows
                  how to paint, so the "×" doesn't apply here. */}
              <SelectTrigger
                id="resource-table-page-size"
                size="sm"
                className="w-20"
                clearable={false}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <nav aria-label={t('common.table.pagination')}>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                {t('common.table.previous')}
              </Button>
              <span aria-current="page" className="text-sm text-muted-foreground">
                {t('common.table.pageStatus', { page, pages: totalPages, count })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                {t('common.table.next')}
              </Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

interface ResourceTableSkeletonProps<T> {
  columns: ResourceTableColumn<T>[];
  pageSize: number;
}

function ResourceTableSkeleton<T>({ columns, pageSize }: ResourceTableSkeletonProps<T>) {
  const { t } = useTranslation();
  const rows = Array.from({ length: pageSize });

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader className="bg-primary/8">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key}>{t(column.header)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((_, rowIndex) => (
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
        {rows.map((_, rowIndex) => (
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

interface ResourceTableErrorProps {
  message: string;
  onRetry: () => void;
}

function ResourceTableError({ message, onRetry }: ResourceTableErrorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t('common.table.error')}</p>
      <p className="text-sm text-destructive">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('common.table.retry')}
      </Button>
    </div>
  );
}

interface ResourceTableEmptyProps {
  messageKey: string;
  onCreate?: () => void;
  onClearFilters?: () => void;
}

function ResourceTableEmpty({ messageKey, onCreate, onClearFilters }: ResourceTableEmptyProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <InboxIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t(messageKey)}</p>
      {onClearFilters && (
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
          {t('common.table.clearFilters')}
        </Button>
      )}
      {onCreate && (
        <Button type="button" size="sm" onClick={onCreate}>
          <PlusIcon aria-hidden="true" />
          {t('common.actions.create')}
        </Button>
      )}
    </div>
  );
}

interface ResourceTableCardProps<T> {
  row: T;
  columns: ResourceTableColumn<T>[];
  rowActions?: (row: T) => ReactNode;
  isInactive?: boolean;
}

function ResourceTableCard<T>({ row, columns, rowActions, isInactive }: ResourceTableCardProps<T>) {
  const { t } = useTranslation();
  const primary = columns.filter((column) => column.card === 'primary');
  const secondary = columns.filter((column) => column.card === 'secondary');
  const meta = columns.filter((column) => column.card === 'meta');

  return (
    <Card className={cn(isInactive && 'bg-destructive/5')}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {primary.map((column) => (
            <div key={column.key} className="font-medium text-foreground">
              {column.render(row)}
            </div>
          ))}
          {secondary.map((column) => (
            <div key={column.key} className="text-sm text-muted-foreground">
              {column.render(row)}
            </div>
          ))}
          {meta.length > 0 && (
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {meta.map((column) => (
                <span key={column.key}>{column.render(row)}</span>
              ))}
            </div>
          )}
        </div>
        {rowActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.table.rowActions')}
              >
                <MoreVerticalIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{rowActions(row)}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}
