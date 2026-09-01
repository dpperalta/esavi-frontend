import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { XIcon } from 'lucide-react';
import type { GeoLocation } from '@/contracts/declared/geoLocation';
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
import { Button } from '@/shared/components/ui/button';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { geoLevelTypeResource } from '@/features/geoLevelType/api';
import { geoLocationResource } from './api';
import { GeoLocationAuditSheet } from './GeoLocationAuditSheet';
import { GeoLocationFormDialog } from './GeoLocationFormDialog';

type ConfirmAction = 'deactivate' | 'activate';

const ALL_LEVELS = '__all__';
// Debounce before writing `q` into `searchParams` (SPEC FE04 §3.5) — same criterion as any text
// filter, so a keystroke doesn't refetch and doesn't rewrite the URL on every character.
const SEARCH_DEBOUNCE_MS = 400;

interface RowActionsProps {
  row: GeoLocation;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// A distinct component, not a plain callback — same reason as the other entities' RowActions: it
// owns its own `useCan()` calls, one per rendered row.
export function GeoLocationRowActions({ row, onEdit, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // CONVENTIONS.md §10.4: audit trail is SUPERADMIN-only, no exceptions.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(row.geoLocationId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.geoLocationId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
      {canDeactivate && row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.geoLocationId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.geoLocationId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

export function GeoLocationListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const geoLevelId = searchParams.get('geoLevelId');
  const parentId = searchParams.get('parentId');
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);

  // Same cache entry the filter combo and the "Nivel" column use — one query, `limit: 100`, like
  // `CatalogTypeSelect` in FE03 (SPEC FE04 §3.5).
  const levelTypes = geoLevelTypeResource.useList({ pageSize: 100 });
  const levelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of levelTypes.data?.rows ?? []) {
      map.set(row.geoLevelTypeId, row.name);
    }
    return map;
  }, [levelTypes.data]);

  const isFiltered = !!(geoLevelId || parentId || q);
  // ESAVI-GEOLOC-002 — single route, `serverDecides` (SPEC FE04 §1 hallazgo B). `q` becomes both
  // `name` and `code` (hallazgo F, §3.3): the backend ORs them, so one field means "name or code
  // contains this text".
  const list = geoLocationResource.useList({
    page,
    pageSize,
    filters: {
      ...(geoLevelId && { geoLevelId }),
      ...(parentId && { parentId }),
      ...(q && { name: q, code: q }),
    },
  });
  const deactivate = geoLocationResource.useDeactivate();
  const activate = geoLocationResource.useActivate!();

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: ConfirmAction } | null>(
    null,
  );

  // Writes the debounced value into `searchParams.q`, resetting `page` — never a separate
  // `filters.search` the backend doesn't recognize (SPEC FE04 §3.3, hallazgo F).
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

  function handleGeoLevelChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === ALL_LEVELS) {
      next.delete('geoLevelId');
    } else {
      next.set('geoLevelId', value);
    }
    // A parent chosen under the previous level filter can be too deep (or the same level) for
    // the new one — same reasoning as the create/edit form.
    next.delete('parentId');
    next.delete('page');
    setSearchParams(next);
  }

  function handleParentChange(value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('parentId', value);
    } else {
      next.delete('parentId');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function handleClearFilters() {
    setSearchInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('geoLevelId');
    next.delete('parentId');
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
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmTarget(null);
      },
    });
  }

  const columns: ResourceTableColumn<GeoLocation>[] = [
    {
      key: 'name',
      header: 'geoLocation.fields.name',
      render: (row) => row.name,
      card: 'primary',
    },
    {
      key: 'geoLevelTypeId',
      header: 'geoLocation.fields.geoLevelTypeId',
      // Derived from the cached geoLevelType query, never copied to state (SPEC FE04 §3.5): the
      // raw id shows while that query is still loading, never a placeholder that gets stuck.
      render: (row) =>
        (row.geoLevelTypeId && levelNameById.get(row.geoLevelTypeId)) || row.geoLevelTypeId || '—',
      card: 'secondary',
    },
    {
      key: 'externalCode',
      header: 'geoLocation.fields.externalCode',
      render: (row) => row.externalCode,
      card: 'meta',
    },
    {
      key: 'isActive',
      header: 'geoLocation.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'geoLocation.status.active' : 'geoLocation.status.inactive')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('geoLocation.list.title')}</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <Label htmlFor="geo-location-level-filter">{t('geoLocation.filters.geoLevelType')}</Label>
          <Select value={geoLevelId ?? ALL_LEVELS} onValueChange={handleGeoLevelChange}>
            <SelectTrigger id="geo-location-level-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LEVELS}>{t('common.table.allOption')}</SelectItem>
              {(levelTypes.data?.rows ?? []).map((row) => (
                <SelectItem key={row.geoLevelTypeId} value={row.geoLevelTypeId}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label>{t('geoLocation.filters.parent')}</Label>
          <GeoLocationPicker
            value={parentId}
            onChange={handleParentChange}
            // Consistent with the create/edit form: a "parent" filtered under a chosen level
            // filter can only be a level above it.
            maxLevelTypeId={geoLevelId ?? undefined}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label htmlFor="geo-location-search">{t('geoLocation.filters.search')}</Label>
          <Input
            id="geo-location-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        {/* Single clear-all action, on the same row as the filters, pushed to the far right
            (sm:ml-auto) — available even while there are results, not only from the
            empty-filtered state inside <ResourceTable> (§3.8). Disabled rather than hidden
            while no filter is active, so it's never a dead click. Kept as one button, not one
            "X" per field, so a future clearable-<Select> primitive (SPEC FE04 follow-up, out of
            this spec's scope) won't end up duplicating the affordance. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:ml-auto"
          disabled={!isFiltered}
          onClick={handleClearFilters}
        >
          <XIcon aria-hidden="true" />
          {t('common.table.clearFilters')}
        </Button>
      </div>

      <ResourceTable<GeoLocation>
        columns={columns}
        data={list.data}
        idField="geoLocationId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="serverDecides"
        canCreate={canCreate}
        onCreate={handleCreate}
        emptyKey="geoLocation.list.empty"
        emptyFilteredKey="geoLocation.list.emptyFiltered"
        isFiltered={isFiltered}
        onClearFilters={handleClearFilters}
        isRowInactive={(row) => !row.isActive}
        rowActions={(row) => (
          <GeoLocationRowActions
            row={row}
            onEdit={handleEdit}
            onAudit={setAuditId}
            onConfirm={(id, action) => setConfirmTarget({ id, action })}
          />
        )}
      />

      <GeoLocationFormDialog open={formOpen} geoLocationId={editingId} onOpenChange={setFormOpen} />

      <GeoLocationAuditSheet
        open={auditId !== null}
        geoLocationId={auditId}
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
