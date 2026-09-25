import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Diluent } from '@/contracts/declared/diluent';
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
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { diluentResource } from './api';
import { DiluentAuditSheet } from './DiluentAuditSheet';
import { DiluentFormDialog } from './DiluentFormDialog';
import { DiluentRowActions, type DiluentConfirmAction } from './DiluentRowActions';

const SEARCH_DEBOUNCE_MS = 400;
// Below this the backend answers 400 (diluentCatalog.validator.ts), so the term never travels.
const SEARCH_MIN_LENGTH = 2;

export function DiluentListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);

  const term = q.trim();
  const isSearching = term.length >= SEARCH_MIN_LENGTH;
  // The backend ORs `name` and `code` (diluentCatalog.service.ts), so one box travels in both.
  // Never `search`: it is the frozen alias of SPEC F52.
  const filters = useMemo(
    () => (isSearching ? { name: term, code: term } : undefined),
    [isSearching, term],
  );

  // ESAVI-DILUENT-002A / ESAVI-DILUENT-002B — the factory picks the route from the role and the
  // toggle (CONVENTIONS.md §6.5).
  const list = diluentResource.useList({ page, pageSize, includeInactive, filters });
  // ESAVI-DILUENT-005A / ESAVI-DILUENT-005B
  const deactivate = diluentResource.useDeactivate();
  const activate = diluentResource.useActivate!();

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    action: DiluentConfirmAction;
  } | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput === (searchParams.get('q') ?? '')) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (searchInput) {
        next.set('q', searchInput);
      } else {
        next.delete('q');
      }
      next.delete('page');
      setSearchParams(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Re-runs only when the typed value changes — `searchParams` would refire it on every
    // navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function updateParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next);
  }

  function handleIncludeInactiveChange(value: boolean) {
    updateParams((next) => {
      if (value) {
        next.set('includeInactive', 'true');
      } else {
        next.delete('includeInactive');
      }
      next.delete('page');
    });
  }

  function handleClearSearch() {
    setSearchInput('');
    updateParams((next) => {
      next.delete('q');
      next.delete('page');
    });
  }

  function handlePageChange(nextPage: number) {
    updateParams((next) => {
      if (nextPage <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(nextPage));
      }
    });
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
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmTarget(null);
      },
    });
  }

  const columns: ResourceTableColumn<Diluent>[] = [
    {
      key: 'name',
      header: 'diluent.fields.name',
      render: (row) => row.name,
      card: 'primary',
    },
    {
      key: 'code',
      header: 'diluent.fields.code',
      render: (row) => row.code ?? '—',
      card: 'secondary',
    },
    {
      key: 'composition',
      header: 'diluent.fields.composition',
      render: (row) =>
        row.composition ? (
          <span className="block max-w-full truncate md:max-w-xs" title={row.composition}>
            {row.composition}
          </span>
        ) : (
          '—'
        ),
      card: 'meta',
    },
    {
      key: 'isActive',
      header: 'diluent.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'diluent.status.active' : 'diluent.status.inactive')}
        </Badge>
      ),
      // In the card too: the tint alone doesn't say "inactive" (CONVENTIONS.md §10.1).
      card: 'meta',
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('diluent.list.title')}</h1>

      <div className="flex flex-col gap-1.5 sm:w-80">
        <Label htmlFor="diluent-search">{t('diluent.filters.search')}</Label>
        <Input
          id="diluent-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-describedby="diluent-search-hint"
        />
        <p id="diluent-search-hint" className="text-xs text-muted-foreground">
          {t('diluent.filters.searchHint')}
        </p>
      </div>

      <ResourceTable<Diluent>
        columns={columns}
        data={list.data}
        idField="diluentCatalogId"
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
        createLabel="diluent.list.create"
        emptyKey="diluent.list.empty"
        isFiltered={isSearching}
        emptyFilteredKey="diluent.list.emptySearch"
        onClearFilters={handleClearSearch}
        clearFiltersLabel="diluent.list.clearSearch"
        isRowInactive={(row) => !row.isActive}
        // USER has no action at all; ADMIN has none on an inactive row (§3.1) — no empty menu.
        rowActions={
          isAdmin
            ? (row) => (
                <DiluentRowActions
                  row={row}
                  onEdit={handleEdit}
                  onAudit={setAuditId}
                  onConfirm={(id, action) => setConfirmTarget({ id, action })}
                />
              )
            : undefined
        }
        rowActionsLabel="diluent.actions.menu"
        hasRowActions={(row) => row.isActive || isSuperAdmin}
      />

      <DiluentFormDialog open={formOpen} diluentId={editingId} onOpenChange={setFormOpen} />

      <DiluentAuditSheet
        open={auditId !== null}
        diluentId={auditId}
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
