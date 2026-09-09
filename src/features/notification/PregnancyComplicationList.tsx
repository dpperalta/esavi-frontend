import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationPregnancyComplicationDetail } from '@/contracts/declared/notificationPregnancyComplication';
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
import { notificationPregnancyComplicationResource, useNotificationPregnancyComplicationsByPregnancy } from './api';
import { PregnancyComplicationFormDialog } from './PregnancyComplicationFormDialog';

export interface PregnancyComplicationListProps {
  // `null` significa que el bloque de embarazo todavía no tiene fila — «Alta, sin fila todavía»
  // de SPEC FE12d §3.6: la sección se muestra deshabilitada con su explicación, no se oculta.
  pregnancyId: string | null;
  // Expediente cerrado (§3.6, mismo criterio que `EventList`): sin «Añadir» y sin acciones de
  // fila.
  readOnly?: boolean;
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

function complicationLabel(row: NotificationPregnancyComplicationDetail): string {
  return row.complicationRawName ?? row.diagnosticTerm?.name ?? '';
}

// La segunda fase del bloque de embarazo (SPEC FE12d §4 paso 9). Sobre `<SatelliteList>`, igual
// que `EventList`: sus columnas y sus acciones son enteramente de aquí. `PREGCOMP-005A` es la
// única escritura ADMIN de todo este spec (§10.4) — el mensaje de rol al retirar es propio, no el
// genérico de `notification.satellites`.
export function PregnancyComplicationList({ pregnancyId, readOnly = false }: PregnancyComplicationListProps) {
  const { t } = useTranslation();
  const complications = useNotificationPregnancyComplicationsByPregnancy(
    pregnancyId ?? undefined,
    pregnancyId !== null,
  );
  const deactivate = notificationPregnancyComplicationResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; complicationId: string | null }>({
    open: false,
    complicationId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<NotificationPregnancyComplicationDetail | null>(null);

  // Deshabilitada con su explicación (§3.6): guardar el bloque es lo que crea `pregnancyId`, y
  // sin él no hay padre al que colgar ninguna complicación — mismo criterio que `EventList`
  // devuelve `null` sin `notificationId`, pero aquí sí se pinta la sección, apagada.
  if (pregnancyId === null) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('notification.pregnancy.complications.sectionTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('notification.pregnancy.complications.needsParent')}</p>
      </div>
    );
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    deactivate.mutate(target.complicationId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        if (isRoleForbidden(error)) {
          toast.error(t('notification.pregnancy.complications.roleForbidden.delete'));
          return;
        }
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<NotificationPregnancyComplicationDetail>[] = [
    {
      key: 'complicationName',
      header: 'notification.pregnancy.complications.field.complicationName',
      render: complicationLabel,
      card: 'primary',
    },
    {
      key: 'complicationType',
      header: 'notification.pregnancy.complications.field.complicationTypeItemId',
      render: (row) => row.complicationType?.name ?? null,
      card: 'secondary',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<NotificationPregnancyComplicationDetail>
        titleKey="notification.pregnancy.complications.sectionTitle"
        columns={columns}
        rows={complications.data?.rows ?? []}
        idField="complicationId"
        getRowLabel={complicationLabel}
        isLoading={complications.isLoading}
        isError={complications.isError}
        error={complications.error instanceof EsaviApiError ? complications.error : null}
        onRetry={() => void complications.refetch()}
        onAdd={readOnly ? undefined : () => setDialog({ open: true, complicationId: null })}
        onEdit={readOnly ? undefined : (row) => setDialog({ open: true, complicationId: row.complicationId })}
        onDelete={readOnly ? undefined : (row) => setRemoveTarget(row)}
      />

      <PregnancyComplicationFormDialog
        open={dialog.open}
        pregnancyId={pregnancyId}
        complicationId={dialog.complicationId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notification.pregnancy.complications.delete.confirm', {
                name: removeTarget ? complicationLabel(removeTarget) : '',
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
