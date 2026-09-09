import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

export interface PregnancyBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Qué exclusión de la compuerta disparó el bloqueo (CASE-PROCESS.md §7.4): las dos bloquean por
  // igual, pero el texto nombra la que corresponde.
  reason: 'sex' | 'age' | null;
  activeComplicationsCount: number;
  onClear: () => void;
  isClearing: boolean;
}

// El diálogo del bloqueo de los pasos 1 y 2 (SPEC FE12d §4 paso 13, §8), compartido por
// `PatientFormDialog` (sexo, fecha de nacimiento) y `CaseOpeningStep` (fecha del evento) —
// CONVENTIONS.md §10.4 prohíbe escribirlo dos veces. Nombra lo que hay, dice quién puede
// retirarlo y ofrece «Vaciar el bloque de embarazo» con un solo `NOTIFPRG-004` — nunca
// `NOTIFPRG-005A` (§2, §3.2). El bloqueo no depende del rol (CASE-PROCESS.md §7.4): lo único que
// cambia es el texto, que nombra la salida.
export function PregnancyBlockDialog({
  open,
  onOpenChange,
  reason,
  activeComplicationsCount,
  onClear,
  isClearing,
}: PregnancyBlockDialogProps) {
  const { t } = useTranslation();
  const canAdminComplications = useCan(ROLE_LEVELS.ADMIN);
  // No se ofrece vaciar hasta que las complicaciones se retiren una a una (§4 paso 13
  // verificación): `PREGCOMP-005A` es ADMIN, y vaciar el bloque con filas activas colgando dejaría
  // complicaciones huérfanas de una fila que ya no existiría en la práctica.
  const canClear = activeComplicationsCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notification.pregnancy.gate.blockedTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            {reason === 'sex'
              ? t('notification.pregnancy.gate.blocked.sex')
              : t('notification.pregnancy.gate.blocked.age')}
          </p>
          {activeComplicationsCount > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                canAdminComplications
                  ? 'notification.pregnancy.gate.blocked.complications'
                  : 'notification.pregnancy.gate.blocked.complicationsNeedsAdmin',
                { count: activeComplicationsCount },
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" onClick={onClear} disabled={!canClear || isClearing}>
            {t('notification.pregnancy.gate.clearBlock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
