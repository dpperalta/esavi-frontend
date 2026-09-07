import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationEventDetail } from '@/contracts/declared/notificationEvent';
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
import { Checkbox } from '@/shared/components/ui/checkbox';
import { notificationEventResource, useNotificationEventsByCase } from './api';
import { EventFormDialog } from './EventFormDialog';

export interface EventListProps {
  caseId: string;
  // `null` significa que la cabecera todavía no existe: la sección no se renderiza (SPEC FE12b
  // §3.6) — no basta con ocultarla, no puede estar en el DOM.
  notificationId: string | null;
  // Caso cerrado (§3.6): sin «Añadir» y sin acciones de fila. El aviso lo pinta `CaseWizardPage`
  // (FE08); esta lista sólo deja de ofrecer las acciones.
  readOnly?: boolean;
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

// La primera de las dos listas planas del paso 4 (SPEC FE12b §2). Sobre `<SatelliteList>`, sin
// saber de ninguna otra entidad: sus columnas y sus acciones son enteramente de aquí.
export function EventList({ caseId, notificationId, readOnly = false }: EventListProps) {
  const { t } = useTranslation();
  const events = useNotificationEventsByCase(caseId, notificationId !== null);
  const update = notificationEventResource.useUpdate();
  const deactivate = notificationEventResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; eventId: string | null }>({
    open: false,
    eventId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<NotificationEventDetail | null>(null);

  if (notificationId === null) {
    return null;
  }

  // `isMainEsavi` se cambia sin abrir el modal — el criterio de aceptación es justo que marcar
  // uno no desmarque el otro, y aquí sólo se manda un `PUT` sobre la fila que se tocó.
  function handleToggleMain(row: NotificationEventDetail, checked: boolean) {
    update.mutate(
      { id: row.eventId, data: { isMainEsavi: checked } },
      {
        onError: (error) => {
          if (isRoleForbidden(error)) {
            toast.error(t('notification.satellites.adminRequiredEdit'));
            return;
          }
          toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
        },
      },
    );
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    deactivate.mutate(target.eventId, {
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

  const columns: SatelliteListColumn<NotificationEventDetail>[] = [
    {
      key: 'esaviName',
      header: 'notification.events.fields.esaviName',
      render: (row) => row.esaviName,
      card: 'primary',
    },
    {
      key: 'startDate',
      header: 'notification.events.fields.startDate',
      render: (row) => (row.startDate ? format(new Date(`${row.startDate}T00:00:00`), 'dd/MM/yyyy') : null),
      card: 'secondary',
    },
    {
      key: 'isMainEsavi',
      header: 'notification.events.fields.isMainEsavi',
      render: (row) => (
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={row.isMainEsavi}
            disabled={readOnly}
            onCheckedChange={(checked) => handleToggleMain(row, checked === true)}
            aria-label={t('notification.events.fields.isMainEsavi')}
          />
          {t('notification.events.fields.isMainEsavi')}
        </label>
      ),
      card: 'secondary',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<NotificationEventDetail>
        titleKey="notification.events.sectionTitle"
        columns={columns}
        rows={events.data?.rows ?? []}
        idField="eventId"
        getRowLabel={(row) => row.esaviName}
        isLoading={events.isLoading}
        isError={events.isError}
        error={events.error instanceof EsaviApiError ? events.error : null}
        onRetry={() => void events.refetch()}
        onAdd={readOnly ? undefined : () => setDialog({ open: true, eventId: null })}
        onEdit={readOnly ? undefined : (row) => setDialog({ open: true, eventId: row.eventId })}
        onDelete={readOnly ? undefined : (row) => setRemoveTarget(row)}
      />

      <EventFormDialog
        open={dialog.open}
        notificationId={notificationId}
        eventId={dialog.eventId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notification.satellites.deleteConfirm', { name: removeTarget?.esaviName ?? '' })}
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
