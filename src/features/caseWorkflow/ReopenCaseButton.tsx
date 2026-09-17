import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useReopenCase } from '@/features/caseWorkflow/api';
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

interface ReopenCaseButtonProps {
  caseId: string;
}

// ESAVI-CASEFLOW-009 — one button, one dialog, one error map, reused in the three places the
// spec names: the closure step's closed summary, the wizard's read-only banner and the case
// detail page's workflow status block (SPEC FE14b §2, §6 "un solo componente"). Renders nothing
// without ADMIN: the three USER callers keep their "pídeselo a un administrador" text instead.
export function ReopenCaseButton({ caseId }: ReopenCaseButtonProps) {
  const { t } = useTranslation();
  const canReopen = useCan(ROLE_LEVELS.ADMIN);
  const [open, setOpen] = useState(false);
  const reopen = useReopenCase(caseId);

  if (!canReopen) {
    return null;
  }

  function handleConfirm() {
    reopen.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('caseWorkflow.reopen.success'));
        setOpen(false);
      },
      onError: (error) => {
        // §3.5 — the only code with its own text; the other three (`NOT_FOUND`, `NOT_CLOSED`,
        // `REOPEN_FAILED`) already have a stable entry in errorMessages.ts (SPEC FE14b §4 paso 1).
        // A tab open long enough for the role to change underneath it is the one path here.
        if (error instanceof EsaviApiError && error.code === 'AUTH_ROLE_FORBIDDEN') {
          toast.error(t('caseWorkflow.reopen.forbidden'));
        } else if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        // Dialogs close on success and on error alike (§3.5): a `409 NOT_CLOSED` already
        // re-reads the workflow, and the closed line's own re-render is the explanation.
        setOpen(false);
      },
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('caseWorkflow.reopen.action')}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('caseWorkflow.reopen.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('caseWorkflow.reopen.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={reopen.isPending}>
              {t('caseWorkflow.reopen.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
