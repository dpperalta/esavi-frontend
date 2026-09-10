import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationMedicalHistoryDetail } from '@/contracts/declared/notificationMedicalHistory';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { notificationMedicalHistoryResource, useNotificationMedicalHistoriesByCase } from './api';
import { MedicalHistoryFormDialog } from './MedicalHistoryFormDialog';

export interface MedicalHistoryListProps {
  caseId: string;
  // `null` means the notification header does not exist yet: the section is not rendered (SPEC
  // FE12e §3.6) — with no `notificationId` there is no parent to hang an antecedent on.
  notificationId: string | null;
  // Closed case (§3.6): no «Añadir» and no row actions — same pattern as its four sibling lists.
  readOnly?: boolean;
}

// The effective name of the row (§3.3): `historyRaw` is null exactly when the notifier wrote what
// the master already says, so the master's name is what shows then. Derived in render from the
// cached row, never copied into state (§3.4, punto 1).
function effectiveName(row: NotificationMedicalHistoryDetail): string {
  return row.historyRaw ?? row.diagnosticTerm?.name ?? '';
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

// The seventh satellite list of step 4 (SPEC FE12e §1B), on `<SatelliteList>` like the other six.
// Read by case (`ESAVI-MEDHIST-006`) and written with `001`/`004`/`005A` — the gate of §3.6 that
// decides whether this section exists at all arrives in step 11.
export function MedicalHistoryList({
  caseId,
  notificationId,
  readOnly = false,
}: MedicalHistoryListProps) {
  const { t } = useTranslation();
  const histories = useNotificationMedicalHistoriesByCase(caseId, notificationId !== null);
  const deactivate = notificationMedicalHistoryResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; medicalHistoryId: string | null }>({
    open: false,
    medicalHistoryId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<NotificationMedicalHistoryDetail | null>(null);

  if (notificationId === null) {
    return null;
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    deactivate.mutate(target.medicalHistoryId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        // §10.4: retiring an antecedent takes an administrator in this deployment, even though
        // creating and correcting one does not. Saying so beats a generic failure.
        if (isRoleForbidden(error)) {
          toast.error(t('notification.medicalHistory.roleForbidden.delete'));
          return;
        }
        toast.error(
          error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'),
        );
      },
    });
  }

  const columns: SatelliteListColumn<NotificationMedicalHistoryDetail>[] = [
    {
      key: 'historyName',
      header: 'notification.medicalHistory.fields.historyName',
      render: (row) => effectiveName(row),
      card: 'primary',
    },
    {
      key: 'historyCode',
      header: 'notification.medicalHistory.fields.historyCode',
      render: (row) => row.diagnosticTerm?.code ?? null,
    },
    {
      key: 'notes',
      header: 'notification.medicalHistory.fields.notes',
      render: (row) => row.notes,
      card: 'secondary',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<NotificationMedicalHistoryDetail>
        titleKey="notification.section.medicalHistory"
        columns={columns}
        rows={histories.data?.rows ?? []}
        idField="medicalHistoryId"
        getRowLabel={effectiveName}
        isLoading={histories.isLoading}
        isError={histories.isError}
        error={histories.error instanceof EsaviApiError ? histories.error : null}
        onRetry={() => void histories.refetch()}
        onAdd={readOnly ? undefined : () => setDialog({ open: true, medicalHistoryId: null })}
        onEdit={
          readOnly
            ? undefined
            : (row) => setDialog({ open: true, medicalHistoryId: row.medicalHistoryId })
        }
        onDelete={readOnly ? undefined : (row) => setRemoveTarget(row)}
      />

      <MedicalHistoryFormDialog
        open={dialog.open}
        caseId={caseId}
        notificationId={notificationId}
        medicalHistoryId={dialog.medicalHistoryId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notification.medicalHistory.delete.confirm', {
                name: removeTarget ? effectiveName(removeTarget) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemove}>
              {t('notification.satellites.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
