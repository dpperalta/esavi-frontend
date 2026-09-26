import { FilterIcon, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { TERM_SOURCES, type TermSource } from '@/contracts/common';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceTable, type ResourceTableColumn } from '@/shared/components/ResourceTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/ui/sheet';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { diagnosticTermResource } from './api';
import { DiagnosticTermAuditSheet } from './DiagnosticTermAuditSheet';
import { DiagnosticTermFormDialog } from './DiagnosticTermFormDialog';
import {
  DiagnosticTermRowActions,
  type DiagnosticTermConfirmAction,
} from './DiagnosticTermRowActions';
import { REVIEW_STATUSES, type ReviewStatus } from './schemas';

const DEBOUNCE_MS = 400;
// Below this the backend answers 400 (diagnosticTerm.validator.ts), so the term never travels.
const SEARCH_MIN_LENGTH = 2;
const IMPORT_PATH = '/diagnostic-terms/import';

function parseSource(value: string | null): TermSource | null {
  return TERM_SOURCES.find((source) => source === value) ?? null;
}

function parseReviewStatus(value: string | null): ReviewStatus | null {
  return REVIEW_STATUSES.find((status) => status === value) ?? null;
}

// A typing buffer for a text filter that lives in `searchParams` (SPEC FE25b §3.4): the input is
// local, and the URL is written once the user stops typing. Writing a value clears `page`.
function useDebouncedParam(key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buffer, setBuffer] = useState(searchParams.get(key) ?? '');

  useEffect(() => {
    const timeout = setTimeout(() => {
      // The functional form reads the URL at write time, so another filter changed while this
      // one was being typed is not overwritten.
      setSearchParams((current) => {
        if (buffer === (current.get(key) ?? '')) {
          return current;
        }
        const next = new URLSearchParams(current);
        if (buffer) {
          next.set(key, buffer);
        } else {
          next.delete(key);
        }
        next.delete('page');
        return next;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Re-runs only when the typed value changes — `searchParams` would refire it on every
    // navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  return [buffer, setBuffer] as const;
}

interface FilterFieldsProps {
  source: TermSource | null;
  onSourceChange: (value: TermSource | null) => void;
  termGroupInput: string;
  onTermGroupInputChange: (value: string) => void;
  reviewStatus: ReviewStatus | null;
  onReviewStatusChange: (value: ReviewStatus | null) => void;
  showReviewStatus: boolean;
}

// Rendered twice — inline from md up, inside the filters Sheet below it — so ids come from useId.
function FilterFields({
  source,
  onSourceChange,
  termGroupInput,
  onTermGroupInputChange,
  reviewStatus,
  onReviewStatusChange,
  showReviewStatus,
}: FilterFieldsProps) {
  const { t } = useTranslation();
  const termGroupId = useId();
  const termGroupHintId = useId();
  const reviewHintId = useId();

  return (
    <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start">
      <div className="flex flex-col gap-1.5 md:w-52">
        <Label>{t('diagnosticTerm.filters.source')}</Label>
        <Select value={source ?? ''} onValueChange={(value) => onSourceChange(parseSource(value))}>
          <SelectTrigger
            className="min-h-11 w-full md:min-h-8"
            aria-label={t('diagnosticTerm.filters.source')}
            onClear={source ? () => onSourceChange(null) : undefined}
          >
            <SelectValue placeholder={t('diagnosticTerm.filters.sourceAll')} />
          </SelectTrigger>
          <SelectContent>
            {TERM_SOURCES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`diagnosticTerm.sources.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 md:w-52">
        <Label htmlFor={termGroupId}>{t('diagnosticTerm.filters.termGroup')}</Label>
        <Input
          id={termGroupId}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 md:min-h-8"
          value={termGroupInput}
          onChange={(event) => onTermGroupInputChange(event.target.value)}
          aria-describedby={termGroupHintId}
        />
        <p id={termGroupHintId} className="text-xs text-muted-foreground">
          {t('diagnosticTerm.filters.termGroupHint')}
        </p>
      </div>

      {showReviewStatus && (
        <div className="flex flex-col gap-1.5 md:w-60">
          <Label>{t('diagnosticTerm.filters.reviewStatus')}</Label>
          <Select
            value={reviewStatus ?? ''}
            onValueChange={(value) => onReviewStatusChange(parseReviewStatus(value))}
          >
            <SelectTrigger
              className="min-h-11 w-full md:min-h-8"
              aria-label={t('diagnosticTerm.filters.reviewStatus')}
              aria-describedby={reviewHintId}
              onClear={reviewStatus ? () => onReviewStatusChange(null) : undefined}
            >
              <SelectValue placeholder={t('diagnosticTerm.filters.reviewStatusAll')} />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`diagnosticTerm.reviewStatuses.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={reviewHintId} className="text-xs text-muted-foreground">
            {t('diagnosticTerm.filters.reviewStatusForcesInactive')}
          </p>
        </div>
      )}
    </div>
  );
}

export function DiagnosticTermListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const pageSize = usePreferencesStore((state) => state.pageSize);

  const q = searchParams.get('q') ?? '';
  const source = parseSource(searchParams.get('source'));
  const termGroup = (searchParams.get('termGroup') ?? '').trim();
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const urlReviewStatus = parseReviewStatus(searchParams.get('reviewStatus'));
  // SPEC FE25b §3.4: reviewStatus is read by 002B alone, so it only ever travels with the toggle
  // on — never to 002A, where it would be ignored in silence and look applied.
  const reviewStatus = isAdmin && includeInactive ? urlReviewStatus : null;
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchInput, setSearchInput] = useDebouncedParam('q');
  const [termGroupInput, setTermGroupInput] = useDebouncedParam('termGroup');
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    action: DiagnosticTermConfirmAction;
  } | null>(null);

  // A hand-edited link with reviewStatus but no toggle is repaired, not silently half-applied.
  useEffect(() => {
    if (isAdmin && urlReviewStatus && !includeInactive) {
      const next = new URLSearchParams(searchParams);
      next.set('includeInactive', 'true');
      setSearchParams(next, { replace: true });
    }
  }, [isAdmin, urlReviewStatus, includeInactive, searchParams, setSearchParams]);

  const term = q.trim();
  const isSearching = term.length >= SEARCH_MIN_LENGTH;
  // The backend ORs `name` and `code` (diagnosticTerm.service.ts:33), so one box travels in both.
  // Never `search`: it is the frozen alias of SPEC F52.
  const filters = useMemo(() => {
    const next: Record<string, string> = {};
    if (isSearching) {
      next.name = term;
      next.code = term;
    }
    if (source) next.source = source;
    if (termGroup) next.termGroup = termGroup;
    if (reviewStatus) next.reviewStatus = reviewStatus;
    return Object.keys(next).length > 0 ? next : undefined;
  }, [isSearching, term, source, termGroup, reviewStatus]);

  // ESAVI-DIAGTERM-002A / ESAVI-DIAGTERM-002B — the factory picks the route from the role and
  // the toggle (CONVENTIONS.md §6.5).
  const list = diagnosticTermResource.useList({ page, pageSize, includeInactive, filters });
  // ESAVI-DIAGTERM-005A / ESAVI-DIAGTERM-005B
  const deactivate = diagnosticTermResource.useDeactivate();
  const activate = diagnosticTermResource.useActivate!();

  const activeFilterCount = [source, termGroup, reviewStatus].filter(Boolean).length;
  const isFiltered = isSearching || activeFilterCount > 0;

  function updateParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    next.delete('page');
    setSearchParams(next);
  }

  function handleSourceChange(value: TermSource | null) {
    updateParams((next) => (value ? next.set('source', value) : next.delete('source')));
  }

  function handleReviewStatusChange(value: ReviewStatus | null) {
    updateParams((next) => {
      if (value) {
        next.set('reviewStatus', value);
        next.set('includeInactive', 'true');
      } else {
        next.delete('reviewStatus');
      }
    });
  }

  function handleIncludeInactiveChange(value: boolean) {
    updateParams((next) => {
      if (value) {
        next.set('includeInactive', 'true');
      } else {
        next.delete('includeInactive');
        next.delete('reviewStatus');
      }
    });
  }

  // §3.6: clears every filter but keeps the toggle.
  function handleClearFilters() {
    setSearchInput('');
    setTermGroupInput('');
    updateParams((next) => {
      next.delete('q');
      next.delete('source');
      next.delete('termGroup');
      next.delete('reviewStatus');
    });
  }

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  }

  function handleCreate() {
    setEditingId(null);
    setFormOpen(true);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setFormOpen(true);
  }

  function handleConfirm() {
    if (!confirmTarget) {
      return;
    }
    const isDeactivate = confirmTarget.action === 'deactivate';
    const mutation = isDeactivate ? deactivate : activate;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.success(t(isDeactivate ? 'common.toast.deactivated' : 'common.toast.activated'));
        setConfirmTarget(null);
      },
      onError: (error) => {
        toast.error(
          error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'),
        );
        setConfirmTarget(null);
      },
    });
  }

  const pendingBadge = (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      {t('diagnosticTerm.status.pending')}
    </Badge>
  );

  const columns: ResourceTableColumn<DiagnosticTerm>[] = [
    {
      key: 'name',
      header: 'diagnosticTerm.fields.name',
      render: (row) => <span className="block max-w-full break-words md:max-w-md">{row.name}</span>,
      card: 'primary',
    },
    {
      key: 'code',
      header: 'diagnosticTerm.fields.code',
      render: (row) => <span className="font-mono text-xs">{row.code ?? '—'}</span>,
      card: 'secondary',
    },
    {
      key: 'source',
      header: 'diagnosticTerm.fields.source',
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {t(`diagnosticTerm.sources.${row.source}`)}
          {/* Mobile card only: on desktop the review column carries it. */}
          {row.metadata?.reviewStatus === 'PENDING' && (
            <span className="md:hidden">{pendingBadge}</span>
          )}
        </span>
      ),
      card: 'meta',
    },
    {
      key: 'termGroup',
      header: 'diagnosticTerm.fields.termGroup',
      render: (row) => row.termGroup ?? '—',
    },
    {
      key: 'reviewStatus',
      header: 'diagnosticTerm.fields.reviewStatus',
      render: (row) => (row.metadata?.reviewStatus === 'PENDING' ? pendingBadge : null),
    },
    {
      key: 'isActive',
      header: 'diagnosticTerm.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'diagnosticTerm.status.active' : 'diagnosticTerm.status.inactive')}
        </Badge>
      ),
      // In the card too: the tint alone doesn't say "inactive" (CONVENTIONS.md §10.1).
      card: 'meta',
    },
  ];

  const filterFields = (
    <FilterFields
      source={source}
      onSourceChange={handleSourceChange}
      termGroupInput={termGroupInput}
      onTermGroupInputChange={setTermGroupInput}
      reviewStatus={isAdmin ? urlReviewStatus : null}
      onReviewStatusChange={handleReviewStatusChange}
      showReviewStatus={isAdmin}
    />
  );

  const importButton = (
    <Button asChild variant="outline" size="touch" className="md:h-8">
      <Link to={IMPORT_PATH}>
        <Upload aria-hidden="true" />
        {t('diagnosticTerm.list.import')}
      </Link>
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">{t('diagnosticTerm.list.title')}</h1>
        {isSuperAdmin && importButton}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 md:w-96">
          <Label htmlFor="diagnostic-term-search">{t('diagnosticTerm.filters.search')}</Label>
          <Input
            id="diagnostic-term-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 md:min-h-8"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-describedby="diagnostic-term-search-hint"
          />
          <p id="diagnostic-term-search-hint" className="text-xs text-muted-foreground">
            {t('diagnosticTerm.filters.searchHint')}
          </p>
        </div>

        <div className="hidden md:block">{filterFields}</div>

        <div className="md:hidden">
          <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="touch">
                <FilterIcon aria-hidden="true" />
                {t('diagnosticTerm.filters.open')}
                {activeFilterCount > 0 && <Badge variant="default">{activeFilterCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t('diagnosticTerm.filters.open')}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">{filterFields}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <ResourceTable<DiagnosticTerm>
        columns={columns}
        data={list.data}
        idField="diagnosticTermId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="adminPath"
        includeInactive={includeInactive}
        onIncludeInactiveChange={handleIncludeInactiveChange}
        canCreate={isAdmin}
        onCreate={handleCreate}
        createLabel="diagnosticTerm.list.create"
        emptyKey="diagnosticTerm.list.empty"
        emptyExtraAction={isSuperAdmin ? importButton : undefined}
        isFiltered={isFiltered}
        emptyFilteredKey="diagnosticTerm.list.emptyFiltered"
        onClearFilters={handleClearFilters}
        clearFiltersLabel="diagnosticTerm.list.clearFilters"
        isRowInactive={(row) => !row.isActive}
        // USER has no action at all; ADMIN has none on an inactive row (§3.1) — no empty menu.
        rowActions={
          isAdmin
            ? (row) => (
                <DiagnosticTermRowActions
                  row={row}
                  onEdit={handleEdit}
                  onAudit={setAuditId}
                  onConfirm={(id, action) => setConfirmTarget({ id, action })}
                />
              )
            : undefined
        }
        rowActionsLabel="diagnosticTerm.actions.menu"
        hasRowActions={(row) => row.isActive || isSuperAdmin}
      />

      <DiagnosticTermFormDialog
        open={formOpen}
        diagnosticTermId={editingId}
        onOpenChange={setFormOpen}
      />

      <DiagnosticTermAuditSheet
        open={auditId !== null}
        diagnosticTermId={auditId}
        onOpenChange={(open) => {
          if (!open) {
            setAuditId(null);
          }
        }}
      />

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                confirmTarget?.action === 'activate'
                  ? 'common.confirm.activate'
                  : 'common.confirm.deactivate',
              )}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t(
                confirmTarget?.action === 'activate'
                  ? 'common.actions.activate'
                  : 'common.actions.deactivate',
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
