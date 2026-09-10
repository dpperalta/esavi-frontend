import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationVaccineDetail } from '@/contracts/declared/notificationVaccine';
import { EsaviApiError } from '@/shared/api/types';
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
import { Badge } from '@/shared/components/ui/badge';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
import { notificationVaccineResource, notificationDiluentsByVaccineKey, useNotificationDiluentsByVaccine, useNotificationVaccinesByCase } from './api';
import { VaccineFormDialog } from './VaccineFormDialog';

export interface VaccineListProps {
  caseId: string;
  // `null` significa que la cabecera de la notificación no existe todavía: la sección no se
  // renderiza (SPEC FE12c §3.6) — sin `notificationId` no hay padre al que colgar nada.
  notificationId: string | null;
  // El `eventDate` del caso (FE09/FE10) — lo necesita `<VaccineFormDialog>` para la coherencia
  // temporal de §3.5, no esta lista.
  eventDate: string | null;
  // Caso cerrado (§3.6): sin «Añadir» y sin acciones de fila — mismo patrón que `<EventList>`.
  readOnly?: boolean;
  // Severe branch only (SPEC FE12e §4 paso 9) — this list never renders diluents itself, it
  // just hands the flag to `<VaccineFormDialog>`.
  showsDiluents: boolean;
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

// La tercera lista del paso 4 y la única anidada (SPEC FE12c §1), completa: alta/edición (paso 8),
// diluyentes en fase 2 (paso 9) y baja con confirmación (paso 10) — sobre `<SatelliteList>`, sin
// saber de diluyentes más allá de nombrarlos en el diálogo de baja.
export function VaccineList({ caseId, notificationId, eventDate, readOnly = false, showsDiluents }: VaccineListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const vaccines = useNotificationVaccinesByCase(caseId, notificationId !== null);
  const deactivate = notificationVaccineResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; vaccineId: string | null }>({
    open: false,
    vaccineId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<NotificationVaccineDetail | null>(null);
  // Se piden sus diluyentes antes de confirmar la baja (§2, §4 paso 10): sin ellos el usuario no
  // sabe qué está retirando, y el `404` heredado aparecería después sin explicación.
  const diluentsOfTarget = useNotificationDiluentsByVaccine(removeTarget?.vaccineId, removeTarget !== null);

  if (notificationId === null) {
    return null;
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    deactivate.mutate(target.vaccineId, {
      onSuccess: () => {
        // La clave de diluyentes de esa vacuna, junto con la lista — y sólo la de esa vacuna
        // (SPEC FE12c §3.4, "Qué invalida qué"): sus filas ya no son alcanzables.
        void queryClient.invalidateQueries({ queryKey: notificationDiluentsByVaccineKey(target.vaccineId) });
        setRemoveTarget(null);
      },
      onError: (error) => {
        setRemoveTarget(null);
        if (isRoleForbidden(error)) {
          toast.error(t('notification.roleForbidden.editDelete'));
          return;
        }
        toast.error(t('common.errors.unexpected'));
      },
    });
  }

  const targetDiluents = diluentsOfTarget.data?.rows ?? [];

  const columns: SatelliteListColumn<NotificationVaccineDetail>[] = [
    {
      key: 'vaccineName',
      header: 'notificationVaccine.field.vaccineName',
      render: (row) => row.vaccineName,
      card: 'primary',
    },
    {
      key: 'vaccinationDate',
      header: 'notificationVaccine.field.vaccinationDate',
      render: (row) => (row.vaccinationDate ? format(new Date(`${row.vaccinationDate}T00:00:00`), 'dd/MM/yyyy') : null),
      card: 'secondary',
    },
    {
      key: 'doseNumber',
      header: 'notificationVaccine.field.doseNumber',
      render: (row) => row.doseNumber,
      card: 'secondary',
    },
    // Sin `card`: aparece como columna normal del escritorio, pero no se cuenta entre los tres
    // campos de la tarjeta móvil — la marca de sospechosa va aparte, como `cardBadge` (§3.7).
    {
      key: 'isSuspected',
      header: 'notificationVaccine.field.isSuspected',
      render: (row) =>
        row.isSuspected ? (
          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
            {t('notificationVaccine.badge.suspected')}
          </Badge>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<NotificationVaccineDetail>
        titleKey="notification.section.vaccines"
        columns={columns}
        rows={vaccines.data?.rows ?? []}
        idField="vaccineId"
        getRowLabel={(row) => row.vaccineName ?? ''}
        cardBadge={(row) =>
          row.isSuspected ? (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
              {t('notificationVaccine.badge.suspected')}
            </Badge>
          ) : null
        }
        isLoading={vaccines.isLoading}
        isError={vaccines.isError}
        error={vaccines.error instanceof EsaviApiError ? vaccines.error : null}
        onRetry={() => void vaccines.refetch()}
        onAdd={readOnly ? undefined : () => setDialog({ open: true, vaccineId: null })}
        onEdit={readOnly ? undefined : (row) => setDialog({ open: true, vaccineId: row.vaccineId })}
        onDelete={readOnly ? undefined : (row) => setRemoveTarget(row)}
      />

      <VaccineFormDialog
        open={dialog.open}
        caseId={caseId}
        notificationId={notificationId}
        eventDate={eventDate}
        vaccineId={dialog.vaccineId}
        showsDiluents={showsDiluents}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {targetDiluents.length > 0
                ? t('notificationVaccine.delete.confirmWithDiluents', {
                    name: removeTarget?.vaccineName ?? '',
                    count: targetDiluents.length,
                  })
                : t('notificationVaccine.delete.confirm', { name: removeTarget?.vaccineName ?? '' })}
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
