import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { SearchIcon } from 'lucide-react';
import type { HealthFacility, HealthFacilitySearchRow } from '@/contracts/declared/healthFacility';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
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
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { catalogTypeResource } from '@/features/catalogType/api';
import { catalogItemResource } from '@/features/catalogItem/api';
import { healthFacilityResource, useHealthFacilitySearch } from './api';
import { HealthFacilityAuditSheet } from './HealthFacilityAuditSheet';
import { HealthFacilityFormDialog } from './HealthFacilityFormDialog';

const FACILITY_TYPE_CATALOG_CODE = 'healthFacilityType';
// Debounce before writing `q` into `searchParams` — same criterion as `GeoLocationListPage`'s
// own search field, so a keystroke doesn't refetch and doesn't rewrite the URL on every character.
const SEARCH_DEBOUNCE_MS = 400;

type ConfirmAction = 'deactivate' | 'activate';
type ScreenMode = 'empty' | 'location' | 'search';

interface RowActionsProps {
  row: HealthFacility;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// A distinct component, not a plain callback — owns its own `useCan()` calls, one per rendered
// row, same precedent as the other entities' RowActions.
export function HealthFacilityRowActions({ row, onEdit, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // CONVENTIONS.md §10.4: audit trail is SUPERADMIN-only, no exceptions.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(row.healthFacilityId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.healthFacilityId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
      {canDeactivate && row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.healthFacilityId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.healthFacilityId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

// SPEC FE06 §3.1, §3.8: shown instead of <ResourceTable> whenever neither a location nor a
// search term is chosen — the screen can't open on its own data (hallazgo A), so it never
// renders a table that would otherwise render empty.
function InvitationPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <SearchIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('healthFacility.list.noSelection')}</p>
    </div>
  );
}

export function HealthFacilityListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const geoLocationId = searchParams.get('geoLocationId');
  const q = searchParams.get('q') ?? '';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);

  // Derived, never stored (SPEC FE06 §3.6): a `mode` searchParam could contradict `q` and
  // `geoLocationId` — search mode with an empty `q` is an impossible state a stored mode would
  // allow.
  const mode: ScreenMode = q.trim().length >= 2 ? 'search' : geoLocationId ? 'location' : 'empty';

  // Same cache entry `<CatalogSelect>` uses for the first hop (SPEC FE06 §3.4) — resolves the
  // `healthFacilityType` catalog once and reuses it for every row's "Tipo" cell instead of one
  // request per row (hallazgo D).
  const typesList = catalogTypeResource.useList({ pageSize: 100 });
  const facilityTypeCatalogTypeId =
    typesList.data?.rows.find((row) => row.code === FACILITY_TYPE_CATALOG_CODE)?.catalogTypeId ??
    '';
  const itemsList = catalogItemResource.useListByParent!(facilityTypeCatalogTypeId, {
    pageSize: 100,
  });
  const typeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of itemsList.data?.rows ?? []) {
      map.set(row.catalogItemId, row.name);
    }
    return map;
  }, [itemsList.data]);

  // ESAVI-HFAC-002A/002B — only active while in location mode; `enabled: !!parentId` inside the
  // factory keeps this unreachable with an empty id (hallazgo A, mode 'empty' or 'search').
  const locationList = healthFacilityResource.useListByParent!(
    mode === 'location' ? (geoLocationId ?? '') : '',
    { page, pageSize, includeInactive },
  );
  // ESAVI-HFAC-006 — only active in search mode (its own `enabled`, two-character minimum).
  // `geoLocationId` travels as an exact AND filter alongside the term when one is chosen.
  const searchList = useHealthFacilitySearch({
    q: mode === 'search' ? q : '',
    geoLocationId: geoLocationId ?? undefined,
    page,
    pageSize,
  });
  const activeList = mode === 'search' ? searchList : locationList;

  const deactivate = healthFacilityResource.useDeactivate();
  const activate = healthFacilityResource.useActivate!();

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: ConfirmAction } | null>(
    null,
  );

  // Writes the debounced value into `searchParams.q`, resetting `page` (SPEC FE06 §3.6).
  useEffect(() => {
    const timeout = setTimeout(() => {
      const currentQ = searchParams.get('q') ?? '';
      if (searchInput === currentQ) {
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
    // Re-runs only when the debounced input changes — `searchParams`/`setSearchParams` would
    // refire this on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function handleLocationChange(nextGeoLocationId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (nextGeoLocationId) {
      next.set('geoLocationId', nextGeoLocationId);
    } else {
      next.delete('geoLocationId');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function handleIncludeInactiveChange(value: boolean) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('includeInactive', 'true');
    } else {
      next.delete('includeInactive');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function handleClearSearch() {
    setSearchInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('page');
    setSearchParams(next);
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
    const mutation = confirmTarget.action === 'deactivate' ? deactivate : activate;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.success(
          t(confirmTarget.action === 'deactivate' ? 'common.toast.deactivated' : 'common.toast.activated'),
        );
        setConfirmTarget(null);
      },
      onError: (error) => {
        // The backend's own translated `message` carries codes like `HFAC_005A_HAS_ACTIVE_CHILDREN`
        // (hallazgo F) — never overridden with a generic failure toast (SPEC FE06 §3.7).
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmTarget(null);
      },
    });
  }

  const columns: ResourceTableColumn<HealthFacility>[] = [
    {
      key: 'name',
      header: 'healthFacility.fields.name',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.name}
          {!row.isActive && (
            <Badge variant="destructive">{t('healthFacility.status.inactive')}</Badge>
          )}
        </span>
      ),
      card: 'primary',
    },
    {
      key: 'localCode',
      header: 'healthFacility.fields.localCode',
      render: (row) => row.localCode ?? '—',
      card: 'secondary',
    },
    {
      key: 'type',
      header: 'healthFacility.columns.type',
      // Derived from the cached catalog query, never copied to state (SPEC FE06 §3.6) — falls
      // back to '—' while `itemsList` is still loading, resolves the name once it lands.
      render: (row) =>
        (row.facilityTypeItemId && typeNameById.get(row.facilityTypeItemId)) || '—',
      card: 'meta',
    },
    // Search-only column (SPEC FE06 §3.5): `HealthFacilitySearchRow` is the only shape carrying
    // `geoLocation`. No `card` slot — location mode already filters by a single location, so this
    // wouldn't add information on mobile either.
    ...(mode === 'search'
      ? [
          {
            key: 'location',
            header: 'healthFacility.columns.location',
            render: (row: HealthFacility) =>
              (row as HealthFacilitySearchRow).geoLocation?.name ?? '—',
          } satisfies ResourceTableColumn<HealthFacility>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('healthFacility.list.title')}</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label>{t('healthFacility.filters.location')}</Label>
          <GeoLocationPicker value={geoLocationId} onChange={handleLocationChange} />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label htmlFor="health-facility-search">{t('healthFacility.filters.search')}</Label>
          <Input
            id="health-facility-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-describedby="health-facility-search-hint"
          />
          <p id="health-facility-search-hint" className="text-xs text-muted-foreground">
            {t('healthFacility.filters.searchHint')}
          </p>
        </div>
      </div>

      {mode === 'empty' && <InvitationPanel />}

      {mode !== 'empty' && (
        <ResourceTable<HealthFacility>
          columns={columns}
          data={activeList.data}
          idField="healthFacilityId"
          isLoading={activeList.isLoading}
          isError={activeList.isError}
          error={activeList.error instanceof EsaviApiError ? activeList.error : null}
          onRetry={() => void activeList.refetch()}
          page={page}
          onPageChange={handlePageChange}
          inactiveMode="adminPath"
          // Hallazgo C: the toggle only exists in location mode — the search route has no
          // equivalent parameter, so it's never offered while searching.
          includeInactive={mode === 'location' ? includeInactive : undefined}
          onIncludeInactiveChange={mode === 'location' ? handleIncludeInactiveChange : undefined}
          canCreate={canCreate}
          onCreate={handleCreate}
          emptyKey={mode === 'search' ? undefined : 'healthFacility.list.emptyLocation'}
          isFiltered={mode === 'search'}
          emptyFilteredKey="healthFacility.list.emptySearch"
          onClearFilters={handleClearSearch}
          clearFiltersLabel="healthFacility.list.clearSearch"
          isRowInactive={(row) => !row.isActive}
          rowActions={(row) => (
            <HealthFacilityRowActions
              row={row}
              onEdit={handleEdit}
              onAudit={setAuditId}
              onConfirm={(id, action) => setConfirmTarget({ id, action })}
            />
          )}
        />
      )}

      <HealthFacilityFormDialog
        open={formOpen}
        healthFacilityId={editingId}
        onOpenChange={setFormOpen}
      />

      <HealthFacilityAuditSheet
        open={auditId !== null}
        healthFacilityId={auditId}
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
