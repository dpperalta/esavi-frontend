import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useActivateCaseWorkflow } from '@/features/caseWorkflow/api';
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
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

interface ReactivateCaseWorkflowButtonProps {
  caseWorkflowId: string;
  caseId: string;
}

// ESAVI-CASEFLOW-005B — the wizard's inactive-record banner (SPEC FE24 §3.1). Renders nothing
// without SUPERADMIN, the real role of the route. The inbox doesn't use it: it keeps its row menu
// and single tab-level dialog.
export function ReactivateCaseWorkflowButton({ caseWorkflowId, caseId }: ReactivateCaseWorkflowButtonProps) {
  const { t } = useTranslation();
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);
  const [open, setOpen] = useState(false);
  const activate = useActivateCaseWorkflow();

  if (!canActivate) {
    return null;
  }

  function handleConfirm() {
    activate.mutate(
      { caseWorkflowId, caseId },
      {
        onSuccess: () => {
          toast.success(t('caseWorkflow.lifecycle.activate.success'));
          setOpen(false);
        },
        onError: (error) => {
          if (error instanceof EsaviApiError) toast.error(getErrorMessage(error));
          // Closes on error too (SPEC FE24 §3.5): a 409 already re-reads `006`, and the banner
          // disappearing is the explanation.
          setOpen(false);
        },
      },
    );
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
        {t('caseWorkflow.lifecycle.activate.confirmAction')}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!activate.isPending) setOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('caseWorkflow.lifecycle.activate.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('caseWorkflow.lifecycle.activate.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch" disabled={activate.isPending}>
              {t('common.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              size="touch"
              disabled={activate.isPending}
              onClick={(event) => {
                // Radix closes the dialog on Action click; kept open so `isPending` is visible
                // and a double click can't fire a second request (SPEC FE24 §3.4).
                event.preventDefault();
                handleConfirm();
              }}
            >
              {t('caseWorkflow.lifecycle.activate.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
