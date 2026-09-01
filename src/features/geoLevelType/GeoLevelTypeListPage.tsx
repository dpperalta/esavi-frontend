import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { GeoLevelType } from '@/contracts/declared/geoLevelType';
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
import { geoLevelTypeResource } from './api';
import { GeoLevelTypeAuditSheet } from './GeoLevelTypeAuditSheet';
import { GeoLevelTypeFormDialog } from './GeoLevelTypeFormDialog';

type ConfirmAction = 'deactivate' | 'activate';

interface RowActionsProps {
  row: GeoLevelType;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// A distinct component, not a plain callback: it owns its own `useCan()` calls, so React sees
// one hook-call count per rendered row instead of ResourceTable accumulating one per row.
export function GeoLevelTypeRowActions({ row, onEdit, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // CONVENTIONS.md §10.4: the audit trail is system information — nobody below SUPERADMIN sees
  // it, not even ADMIN.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(row.geoLevelTypeId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.geoLevelTypeId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
      {canDeactivate && row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.geoLevelTypeId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.geoLevelTypeId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

export function GeoLevelTypeListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);

  // ESAVI-GEOLVL-002 — single route, the backend decides active-vs-all by role (SPEC FE04 §1
  // hallazgo B): no `includeInactive` here, `inactiveMode="serverDecides"` hides the toggle.
  const list = geoLevelTypeResource.useList({ page, pageSize });
  const deactivate = geoLevelTypeResource.useDeactivate();
  const activate = geoLevelTypeResource.useActivate!();

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

  const columns: ResourceTableColumn<GeoLevelType>[] = [
    {
      key: 'name',
      header: 'geoLevelType.fields.name',
      render: (row) => row.name,
      card: 'primary',
    },
    {
      key: 'code',
      header: 'geoLevelType.fields.code',
      render: (row) => row.code,
      card: 'secondary',
    },
    {
      key: 'sortOrder',
      header: 'geoLevelType.fields.sortOrder',
      render: (row) => row.sortOrder,
      card: 'meta',
    },
    {
      key: 'isActive',
      header: 'geoLevelType.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'geoLevelType.status.active' : 'geoLevelType.status.inactive')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('geoLevelType.list.title')}</h1>

      <ResourceTable<GeoLevelType>
        columns={columns}
        data={list.data}
        idField="geoLevelTypeId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="serverDecides"
        canCreate={canCreate}
        onCreate={handleCreate}
        emptyKey="geoLevelType.list.empty"
        isRowInactive={(row) => !row.isActive}
        rowActions={(row) => (
          <GeoLevelTypeRowActions
            row={row}
            onEdit={handleEdit}
            onAudit={setAuditId}
            onConfirm={(id, action) => setConfirmTarget({ id, action })}
          />
        )}
      />

      <GeoLevelTypeFormDialog
        open={formOpen}
        geoLevelTypeId={editingId}
        onOpenChange={setFormOpen}
      />

      <GeoLevelTypeAuditSheet
        open={auditId !== null}
        geoLevelTypeId={auditId}
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
