import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationMedicationDetail } from '@/contracts/declared/notificationMedication';
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
import { notificationMedicationResource, useNotificationMedicationsByCase } from './api';
import { MedicationFormDialog } from './MedicationFormDialog';

export interface MedicationListProps {
  caseId: string;
  // `null` significa que la cabecera todavía no existe: la sección no se renderiza (SPEC FE12b
  // §3.6) — no basta con ocultarla, no puede estar en el DOM.
  notificationId: string | null;
  // Caso cerrado (§3.6): sin «Añadir» y sin acciones de fila.
  readOnly?: boolean;
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

// La segunda de las dos listas planas del paso 4 (SPEC FE12b §2), sobre `<SatelliteList>`.
export function MedicationList({ caseId, notificationId, readOnly = false }: MedicationListProps) {
  const { t } = useTranslation();
  const medications = useNotificationMedicationsByCase(caseId, notificationId !== null);
  const deactivate = notificationMedicationResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; medicationId: string | null }>({
    open: false,
    medicationId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<NotificationMedicationDetail | null>(null);

  if (notificationId === null) {
    return null;
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    deactivate.mutate(target.medicationId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        if (isRoleForbidden(error)) {
          toast.error(t('notification.satellites.adminRequiredDelete'));
          return;
        }
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<NotificationMedicationDetail>[] = [
    {
      key: 'medicationName',
      header: 'notification.medications.fields.medicationName',
      render: (row) => row.medicationName,
      card: 'primary',
    },
    {
      key: 'dose',
      header: 'notification.medications.fields.dose',
      render: (row) => row.dose,
      card: 'secondary',
    },
    {
      key: 'startDate',
      header: 'notification.medications.fields.startDate',
      render: (row) => (row.startDate ? format(new Date(`${row.startDate}T00:00:00`), 'dd/MM/yyyy') : null),
      card: 'secondary',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<NotificationMedicationDetail>
        titleKey="notification.medications.sectionTitle"
        columns={columns}
        rows={medications.data?.rows ?? []}
        idField="medicationId"
        getRowLabel={(row) => row.medicationName}
        isLoading={medications.isLoading}
        isError={medications.isError}
        error={medications.error instanceof EsaviApiError ? medications.error : null}
        onRetry={() => void medications.refetch()}
        onAdd={readOnly ? undefined : () => setDialog({ open: true, medicationId: null })}
        onEdit={readOnly ? undefined : (row) => setDialog({ open: true, medicationId: row.medicationId })}
        onDelete={readOnly ? undefined : (row) => setRemoveTarget(row)}
      />

      <MedicationFormDialog
        open={dialog.open}
        notificationId={notificationId}
        medicationId={dialog.medicationId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notification.satellites.deleteConfirm', { name: removeTarget?.medicationName ?? '' })}
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
