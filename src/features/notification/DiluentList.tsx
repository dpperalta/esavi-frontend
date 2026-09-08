import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { NotificationDiluentDetail } from '@/contracts/declared/notificationDiluent';
import { getErrorMessage } from '@/shared/api/errorMessages';
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
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { notificationDiluentResource, useNotificationDiluentsByVaccine } from './api';
import { DiluentFormRow } from './DiluentFormRow';

export interface DiluentListProps {
  // `null` mientras la vacuna no está guardada — no hay padre al que colgar nada (§3.1).
  vaccineId: string | null;
  vaccinationDate: string | null;
  disabled?: boolean;
}

function isRoleForbidden(error: unknown): boolean {
  return error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN';
}

function diluentLabel(row: NotificationDiluentDetail): string {
  return row.diluentName ?? row.diluentCatalog?.name ?? '';
}

// La lista anidada dentro del modal de su vacuna (SPEC FE12c §3.1, §4 paso 9): lectura perezosa
// por `ESAVI-NOTIFDIL-002A`, habilitada sólo mientras el modal de esa vacuna está abierto y ella
// ya existe. Edita en línea — la fila se expande a `<DiluentFormRow>`, nunca un segundo modal —
// y la baja (paso 10) usa el mismo diálogo de confirmación que nombra la fila.
export function DiluentList({ vaccineId, vaccinationDate, disabled = false }: DiluentListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<'new' | string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<NotificationDiluentDetail | null>(null);
  const diluents = useNotificationDiluentsByVaccine(vaccineId ?? undefined, vaccineId !== null);
  const deactivate = notificationDiluentResource.useDeactivate();

  if (vaccineId === null) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed p-3">
        <p className="text-sm font-medium text-muted-foreground">{t('notificationDiluent.list.title')}</p>
        <p className="text-sm text-muted-foreground">{t('notificationDiluent.list.needsParent')}</p>
      </div>
    );
  }

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.diluentId, {
      onSuccess: () => setRemoveTarget(null),
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

  const rows = diluents.data?.rows ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{t('notificationDiluent.list.title')}</p>
        {!disabled && expanded === null && (
          <Button type="button" size="sm" onClick={() => setExpanded('new')}>
            <PlusIcon aria-hidden="true" />
            {t('notificationDiluent.list.add')}
          </Button>
        )}
      </div>

      {diluents.isLoading && (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {!diluents.isLoading && diluents.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">
            {diluents.error instanceof EsaviApiError
              ? getErrorMessage(diluents.error)
              : t('notificationDiluent.list.error')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => diluents.refetch()}>
            {t('common.table.retry')}
          </Button>
        </div>
      )}

      {!diluents.isLoading &&
        !diluents.isError &&
        rows.map((row) =>
          expanded === row.diluentId ? (
            <DiluentFormRow
              key={row.diluentId}
              vaccineId={vaccineId}
              vaccinationDate={vaccinationDate}
              diluent={row}
              onDone={() => setExpanded(null)}
            />
          ) : (
            <div key={row.diluentId} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>{diluentLabel(row)}</span>
              {!disabled && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.satelliteList.edit', { name: diluentLabel(row) })}
                    onClick={() => setExpanded(row.diluentId)}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.satelliteList.delete', { name: diluentLabel(row) })}
                    onClick={() => setRemoveTarget(row)}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          ),
        )}

      {expanded === 'new' && (
        <DiluentFormRow
          vaccineId={vaccineId}
          vaccinationDate={vaccinationDate}
          diluent={null}
          onDone={() => setExpanded(null)}
        />
      )}

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notificationDiluent.delete.confirm', { name: removeTarget ? diluentLabel(removeTarget) : '' })}
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
