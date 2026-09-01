import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LockIcon, SearchIcon } from 'lucide-react';
import type { CatalogItem } from '@/contracts/declared/catalogItem';
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
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { catalogTypeResource } from '@/features/catalogType/api';
import { CatalogTypeSelect } from '@/features/catalogType/CatalogTypeSelect';
import { catalogItemResource } from './api';
import { CatalogItemAuditSheet } from './CatalogItemAuditSheet';
import { CatalogItemFormDialog } from './CatalogItemFormDialog';

type ConfirmAction = 'deactivate' | 'activate';

interface RowActionsProps {
  row: CatalogItem;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// A distinct component, not a plain callback — same reason as CatalogTypeRowActions (SPEC FE02
// §3.6): it owns its own `useCan()` calls, one per rendered row.
export function CatalogItemRowActions({ row, onEdit, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // CONVENTIONS.md §10.4: audit trail is SUPERADMIN-only, no exceptions.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(row.catalogItemId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.catalogItemId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
      {/* SPEC FE03 §3.8, §6: never offered on a congelada row — the 409 is a known outcome, not
          new information, so provoking it teaches the user nothing. */}
      {canDeactivate && row.isActive && !row.isValueLocked && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.catalogItemId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.catalogItemId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

interface InvitationPanelProps {
  messageKey: string;
  tone?: 'muted' | 'warning';
}

// SPEC FE03 §3.1, §3.7: shown instead of <ResourceTable> whenever there's no usable `typeId` —
// no type picked yet, or a `typeId` the combo doesn't recognize. Never a table that renders empty,
// which would look like "this type has no items" instead of "there's no type to ask about".
function InvitationPanel({ messageKey, tone = 'muted' }: InvitationPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <SearchIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className={tone === 'warning' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {t(messageKey)}
      </p>
    </div>
  );
}

export function CatalogItemListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const typeId = searchParams.get('typeId');
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);

  // Same cache entry <CatalogTypeSelect> uses (`limit: 100`) — React Query dedupes the request,
  // this doesn't add a second network call. Used only to tell a real type from a stale `typeId`
  // in the URL (SPEC FE03 §3.7), never to render the combo itself.
  const typesList = catalogTypeResource.useList({ pageSize: 100 });
  const typeExists = (typesList.data?.rows ?? []).some((row) => row.catalogTypeId === typeId);
  // Three-way, not a boolean: while `typesList` is still loading we don't yet know whether
  // `typeId` is real. Treating "don't know yet" as "known" would let the item query below fire
  // for what might turn out to be a stale type; treating it as "unknown" would flash the warning
  // panel over a perfectly valid one. Neither the table nor the warning panel mounts until this
  // resolves to `'known'` or `'unknown'`.
  const typeStatus: 'known' | 'unknown' | 'pending' = typesList.isLoading
    ? 'pending'
    : typeExists
      ? 'known'
      : 'unknown';

  // ESAVI-CATITEM-002A/002B — `useListByParent` only exists because `config.parent` is set
  // (SPEC FE03 §3.2); `enabled: !!parentId` inside the factory is what keeps this unreachable
  // while `typeId` is null (SPEC FE03 §1 finding A). Passing `''` until `typeStatus` is `'known'`
  // keeps a stale — or not-yet-confirmed — `typeId` in the URL from firing the request either.
  const list = catalogItemResource.useListByParent!(typeStatus === 'known' ? (typeId ?? '') : '', {
    page,
    pageSize,
    includeInactive,
  });
  const deactivate = catalogItemResource.useDeactivate();
  const activate = catalogItemResource.useActivate!();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: ConfirmAction } | null>(
    null,
  );

  function handleTypeChange(nextTypeId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('typeId', nextTypeId);
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

  const columns: ResourceTableColumn<CatalogItem>[] = [
    {
      key: 'name',
      header: 'catalogItem.fields.name',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.name}
          {!row.isActive && (
            <Badge variant="destructive">{t('catalogItem.status.inactive')}</Badge>
          )}
        </span>
      ),
      card: 'primary',
    },
    {
      key: 'value',
      header: 'catalogItem.fields.value',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          {row.value ?? '—'}
          {row.isValueLocked && (
            <LockIcon
              aria-label={t('catalogItem.valueLocked.badge')}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
        </span>
      ),
      card: 'secondary',
    },
    {
      key: 'code',
      header: 'catalogItem.fields.code',
      render: (row) => row.code,
      card: 'meta',
    },
    {
      key: 'description',
      header: 'catalogItem.fields.description',
      render: (row) => row.description ?? '—',
    },
    {
      key: 'sortOrder',
      header: 'catalogItem.fields.sortOrder',
      render: (row) => row.sortOrder ?? '—',
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('catalogItem.list.title')}</h1>

      <div className="w-full sm:max-w-xs">
        <CatalogTypeSelect value={typeId ?? undefined} onValueChange={handleTypeChange} />
      </div>

      {!typeId && <InvitationPanel messageKey="catalogItem.list.noTypeSelected" />}

      {typeId && typeStatus === 'unknown' && (
        <InvitationPanel messageKey="catalogItem.list.unknownType" tone="warning" />
      )}

      {typeId && typeStatus === 'known' && (
        <ResourceTable<CatalogItem>
          columns={columns}
          data={list.data}
          idField="catalogItemId"
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error instanceof EsaviApiError ? list.error : null}
          onRetry={() => void list.refetch()}
          page={page}
          onPageChange={handlePageChange}
          inactiveMode="adminPath"
          includeInactive={includeInactive}
          onIncludeInactiveChange={handleIncludeInactiveChange}
          canCreate={canCreate}
          onCreate={handleCreate}
          emptyKey="catalogItem.list.empty"
          rowActions={(row) => (
            <CatalogItemRowActions
              row={row}
              onEdit={handleEdit}
              onAudit={setAuditId}
              onConfirm={(id, action) => setConfirmTarget({ id, action })}
            />
          )}
        />
      )}

      {typeId && (
        <CatalogItemFormDialog
          open={formOpen}
          catalogItemId={editingId}
          catalogTypeId={typeId}
          onOpenChange={setFormOpen}
        />
      )}

      <CatalogItemAuditSheet
        open={auditId !== null}
        catalogItemId={auditId}
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
