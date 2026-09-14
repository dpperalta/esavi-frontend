import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

// Un bloque es `null` cuando no tiene datos cargados: el diálogo nunca ofrece «Vaciar» algo que
// ya está vacío (SPEC FE13b §4 paso 3).
export interface PregnancyBlockDialogNotificationBlock {
  activeComplicationsCount: number;
  onClear: () => void;
  isClearing: boolean;
}

// Sin conteo: las afecciones del recién nacido no condicionan su «Vaciar» (§4 paso 3 de FE13b —
// no entran en `hasData`, así que no hay nada que esperar aquí).
export interface PregnancyBlockDialogInvestigationBlock {
  onClear: () => void;
  isClearing: boolean;
}

export interface PregnancyBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Qué exclusión de la compuerta disparó el bloqueo (CASE-PROCESS.md §7.4): las dos bloquean por
  // igual, pero el texto nombra la que corresponde.
  reason: 'sex' | 'age' | null;
  notificationBlock: PregnancyBlockDialogNotificationBlock | null;
  investigationBlock: PregnancyBlockDialogInvestigationBlock | null;
}

// El diálogo del bloqueo de los pasos 1 y 2 (SPEC FE12d §4 paso 13, §8), compartido por
// `PatientFormDialog` (sexo, fecha de nacimiento) y `CaseOpeningStep` (fecha del evento) —
// CONVENTIONS.md §10.4 prohíbe escribirlo dos veces. Nombra lo que hay, dice quién puede
// retirarlo y enumera los dos bloques por separado —notificación (paso 4) e investigación (paso
// 5)— cada uno con su propio «Vaciar»: uno con `NOTIFPRG-004`, el otro con `INVMEDH-004`, nunca
// `NOTIFPRG-005A` (SPEC FE12d §2, §3.2; SPEC FE13b §4 paso 3, §6). El bloqueo no depende del rol
// (CASE-PROCESS.md §7.4): lo único que cambia es el texto, que nombra la salida.
export function PregnancyBlockDialog({
  open,
  onOpenChange,
  reason,
  notificationBlock,
  investigationBlock,
}: PregnancyBlockDialogProps) {
  const { t } = useTranslation();
  const canAdminComplications = useCan(ROLE_LEVELS.ADMIN);
  // No se ofrece vaciar el bloque de notificación hasta que las complicaciones se retiren una a
  // una (§4 paso 13 verificación): `PREGCOMP-005A` es ADMIN, y vaciar el bloque con filas activas
  // colgando dejaría complicaciones huérfanas de una fila que ya no existiría en la práctica. El
  // bloque de investigación no tiene esa espera: sus condiciones no entran en `hasData` (SPEC
  // FE13b §4 paso 3).
  const canClearNotification = notificationBlock ? notificationBlock.activeComplicationsCount === 0 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('investigation.pregnancy.blockGuard.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            {reason === 'sex'
              ? t('notification.pregnancy.gate.blocked.sex')
              : t('notification.pregnancy.gate.blocked.age')}
          </p>

          {notificationBlock && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              {notificationBlock.activeComplicationsCount > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {t(
                    canAdminComplications
                      ? 'notification.pregnancy.gate.blocked.complications'
                      : 'notification.pregnancy.gate.blocked.complicationsNeedsAdmin',
                    { count: notificationBlock.activeComplicationsCount },
                  )}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={notificationBlock.onClear}
                disabled={!canClearNotification || notificationBlock.isClearing}
              >
                {t('notification.pregnancy.gate.clearBlock')}
              </Button>
            </div>
          )}

          {investigationBlock && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">
                {t('investigation.pregnancy.blockGuard.investigationBlock')}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={investigationBlock.onClear}
                disabled={investigationBlock.isClearing}
              >
                {t('investigation.pregnancy.blockGuard.clearInvestigation')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
