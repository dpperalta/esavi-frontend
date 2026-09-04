import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotifierListRow } from '@/contracts/declared/notifier';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { NotifierFormDialog } from './NotifierFormDialog';
import { notifierResource } from './api';

export interface NotifierListProps {
  caseId: string;
  // `CaseOpeningStep` gates "Siguiente" on this (SPEC FE10 §5: sin notificador no se avanza) —
  // reusing the count `useList` already fetches here instead of a second, separate query for the
  // same rows.
  onCountChange?: (count: number) => void;
}

function NotifierRow({
  row,
  canRemove,
  onEdit,
  onRemove,
}: {
  row: NotifierListRow;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {row.firstName} {row.lastName}
          </p>
          <p className="text-sm text-muted-foreground">{row.profession?.name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            {t('common.actions.edit')}
          </Button>
          {/* NOTIFIER-005A exige ADMIN (SPEC FE10 §7 riesgo): oculto, no deshabilitado, hasta que
              el rol baje — la interfaz lo dice explícitamente en vez de dejar el botón sin
              explicación. */}
          {canRemove && (
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              {t('notifier.list.removeButton')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// El patrón canónico lista + modal (SPEC FE10 §3.1, §4 paso 10) que nace aquí: nombre, apellido y
// profesión por fila, *Editar* siempre visible y *Quitar* sólo con `useCan(ADMIN)`. La fila lee
// `row.profession`/`row.case` resueltos — nunca un `professionItemId`/`caseId` plano, que
// `NotifierListRow` no declara al primer nivel (SPEC FE10 §3.3).
export function NotifierList({ caseId, onCountChange }: NotifierListProps) {
  const { t } = useTranslation();
  const canRemove = useCan(ROLE_LEVELS.ADMIN);
  const list = notifierResource.useList({ pageSize: 100, filters: { caseId } });
  const deactivate = notifierResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; notifierId: string | null }>({
    open: false,
    notifierId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    if (list.data) {
      onCountChange?.(list.data.count);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onCountChange` is expected to be a stable callback (or the caller accepts the re-fire); re-including it here would defeat the point of forwarding just the count.
  }, [list.data]);

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget, { onSuccess: () => setRemoveTarget(null) });
  }

  const rows = list.data?.rows ?? [];

  return (
    <div className="flex flex-col gap-3">
      {list.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {list.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">
            {list.error instanceof EsaviApiError ? getErrorMessage(list.error) : t('common.errors.unexpected')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>
            {t('common.table.retry')}
          </Button>
        </div>
      )}

      {!list.isLoading && !list.isError && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('notifier.list.emptyRequired')}</p>
      )}

      {!list.isLoading && !list.isError && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <NotifierRow
              key={row.notifierId}
              row={row}
              canRemove={canRemove}
              onEdit={() => setDialog({ open: true, notifierId: row.notifierId })}
              onRemove={() => setRemoveTarget(row.notifierId)}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setDialog({ open: true, notifierId: null })}
      >
        {t('notifier.list.addButton')}
      </Button>

      <NotifierFormDialog
        open={dialog.open}
        caseId={caseId}
        notifierId={dialog.notifierId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm.deactivate')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>{t('common.actions.deactivate')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
