import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useCaseWorkflow,
  useRequestValidation,
  useResolveValidation,
} from '@/features/caseWorkflow/api';
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

interface CaseValidationActionsProps {
  caseId: string;
  mode?: 'full' | 'resolveOnly';
}

// SPEC FE23 §3.1 — the only statuses that offer "Pedir validación". Listed rather than derived
// as "anything but CLOSED and PENDING_VALIDATION": an unknown status code shows no action.
const REQUESTABLE_STATUS_CODES = new Set([
  'OPEN',
  'IN_CLASSIFICATION',
  'IN_NOTIFICATION',
  'IN_INVESTIGATION',
  'IN_FINAL_CLASSIFICATION',
  'REOPENED',
]);

// ESAVI-CASEFLOW-010 / ESAVI-CASEFLOW-011 — one component mounted in the case detail, the wizard
// header and the closure step's `notPendingValidation` line (SPEC FE23 §6). Requesting is NOTIFIER
// and resolving is EVALUATOR (SPEC F64, SPEC FE33 §3.5): whoever records on the case can ask for a
// review, only an evaluator settles it. An action the role can't take is hidden, not disabled.
export function CaseValidationActions({ caseId, mode = 'full' }: CaseValidationActionsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: workflow } = useCaseWorkflow(caseId);
  const requestValidation = useRequestValidation(caseId);
  const resolveValidation = useResolveValidation(caseId);
  const canRequestByRole = useCan(ROLE_LEVELS.NOTIFIER);
  const canResolveByRole = useCan(ROLE_LEVELS.EVALUATOR);

  if (!workflow) {
    return null;
  }

  const statusCode = workflow.status.code;
  const isPending = statusCode === 'PENDING_VALIDATION';
  const canResolve = isPending && canResolveByRole;
  const canRequest =
    canRequestByRole && mode === 'full' && REQUESTABLE_STATUS_CODES.has(statusCode);

  if (!canResolve && !canRequest) {
    return null;
  }

  const action = isPending ? 'resolve' : 'request';
  const mutation = isPending ? resolveValidation : requestValidation;
  const previousName = workflow.previousStatus?.name;

  function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    // Radix's Action closes the dialog on click; keeping it open until the mutation settles is
    // what makes the disabled confirm button visible and blocks a second PATCH (§3.6).
    event.preventDefault();
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t(`caseWorkflow.validation.${action}.success`));
        setOpen(false);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        // Dialogs close on success and on error alike (§3.5): the three 409s already re-read
        // `006`, and the re-rendered status explains what happened.
        setOpen(false);
      },
    });
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
        {t(`caseWorkflow.validation.${action}.action`)}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(`caseWorkflow.validation.${action}.confirmTitle`)}
            </AlertDialogTitle>
            {/* `previousStatus` null while pending is the data inconsistency behind
                `011_PREVIOUS_STATUS_MISSING` (§3.3): there is no state to name, so no body. */}
            {(action === 'request' || previousName) && (
              <AlertDialogDescription>
                {t(`caseWorkflow.validation.${action}.confirmBody`, { previous: previousName })}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction size="touch" onClick={handleConfirm} disabled={mutation.isPending}>
              {t(`caseWorkflow.validation.${action}.confirmAction`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
