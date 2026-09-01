import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CatalogType } from '@/contracts/declared/catalogType';
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
import { catalogTypeResource } from './api';
import { CatalogTypeAuditSheet } from './CatalogTypeAuditSheet';
import { CatalogTypeFormDialog } from './CatalogTypeFormDialog';

type ConfirmAction = 'deactivate' | 'activate';

interface RowActionsProps {
  row: CatalogType;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// A distinct component, not a plain callback: it owns its own `useCan()` calls, so React sees
// one hook-call count per rendered row instead of ResourceTable accumulating one per row in
// its own render pass.
export function CatalogTypeRowActions({ row, onEdit, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // CONVENTIONS.md §10.4: the audit trail is system information, not business data — nobody
  // below SUPERADMIN sees it, not even ADMIN. This is a client-side (UX) gate: `appDetails`
  // still travels on ESAVI-CATTYPE-003 for any USER (SPEC FE02 §7 risk); the real restriction
  // needs a backend change.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(row.catalogTypeId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.catalogTypeId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
      {canDeactivate && row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.catalogTypeId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.catalogTypeId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

export function CatalogTypeListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);

  // ESAVI-CATTYPE-002 — single route, the backend decides active-vs-all by role (SPEC FE02 §1
  // finding B): no `includeInactive` here, `inactiveMode="serverDecides"` hides the toggle.
  const list = catalogTypeResource.useList({ page, pageSize });
  // ESAVI-CATTYPE-005A / ESAVI-CATTYPE-005B — `hasActivate` defaults true for catalogType,
  // which does expose `005B`, so this hook always exists.
  const deactivate = catalogTypeResource.useDeactivate();
  const activate = catalogTypeResource.useActivate!();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: ConfirmAction } | null>(
    null,
  );

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

  const columns: ResourceTableColumn<CatalogType>[] = [
    {
      key: 'name',
      header: 'catalogType.fields.name',
      render: (row) => row.name,
      card: 'primary',
    },
    {
      key: 'code',
      header: 'catalogType.fields.code',
      render: (row) => row.code,
      card: 'secondary',
    },
    {
      key: 'description',
      header: 'catalogType.fields.description',
      render: (row) => row.description ?? '—',
    },
    {
      key: 'sortOrder',
      header: 'catalogType.fields.sortOrder',
      render: (row) => row.sortOrder ?? '—',
      card: 'meta',
    },
    {
      key: 'isActive',
      header: 'catalogType.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'secondary'}>
          {t(row.isActive ? 'catalogType.status.active' : 'catalogType.status.inactive')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('catalogType.list.title')}</h1>

      <ResourceTable<CatalogType>
        columns={columns}
        data={list.data}
        idField="catalogTypeId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="serverDecides"
        canCreate={canCreate}
        onCreate={handleCreate}
        emptyKey="catalogType.list.empty"
        rowActions={(row) => (
          <CatalogTypeRowActions
            row={row}
            onEdit={handleEdit}
            onAudit={setAuditId}
            onConfirm={(id, action) => setConfirmTarget({ id, action })}
          />
        )}
      />

      <CatalogTypeFormDialog
        open={formOpen}
        catalogTypeId={editingId}
        onOpenChange={setFormOpen}
      />

      <CatalogTypeAuditSheet
        open={auditId !== null}
        catalogTypeId={auditId}
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
