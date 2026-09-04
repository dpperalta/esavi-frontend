import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
import { useCaseWorkflow, useCompleteStage } from '@/features/caseWorkflow/api';
import { useCaseWizard } from './CaseWizardContext';
import {
  CASE_WIZARD_STEPS,
  isStepUnlocked,
  stageWorkflowKey,
  type CaseWizardStepSlug,
} from './steps';

interface CaseWizardActionBarProps {
  caseId: string;
  activeSlug: CaseWizardStepSlug;
}

// Guardar · Completar etapa · Siguiente (SPEC FE08 §3.1). Only consumes `CaseWizardContext` —
// it never knows Zod or the shape of any field (§3.5).
export function CaseWizardActionBar({ caseId, activeSlug }: CaseWizardActionBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workflow = useCaseWorkflow(caseId);
  const completeStage = useCompleteStage(caseId);
  const { activeStep, isDirty, pendingFields } = useCaseWizard();
  const [pendingNavigation, setPendingNavigation] = useState<CaseWizardStepSlug | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!workflow.data) {
    return null;
  }

  const { status, stages } = workflow.data;
  const isClosed = status.code === 'CLOSED';
  const activeStepDefinition = CASE_WIZARD_STEPS.find((step) => step.slug === activeSlug);
  const stageExists = activeStepDefinition?.stage
    ? stages[stageWorkflowKey(activeStepDefinition.stage)].exists
    : false;

  const currentIndex = CASE_WIZARD_STEPS.findIndex((step) => step.slug === activeSlug);
  const nextStep = CASE_WIZARD_STEPS[currentIndex + 1] ?? null;
  const nextUnlocked = nextStep ? isStepUnlocked(nextStep.slug, stages) : false;

  function goToStep(slug: CaseWizardStepSlug) {
    navigate(`/esavi-cases/${caseId}/wizard/${slug}`);
  }

  async function handleSave() {
    if (!activeStep) return;
    setIsSaving(true);
    try {
      await activeStep.save();
    } finally {
      setIsSaving(false);
    }
  }

  function handleCompleteStage() {
    if (!activeStepDefinition?.stage) return;
    completeStage.mutate({ stage: activeStepDefinition.stage });
  }

  function handleNext() {
    if (!nextStep) return;
    if (isDirty) {
      setPendingNavigation(nextStep.slug);
      return;
    }
    goToStep(nextStep.slug);
  }

  function confirmNavigation() {
    if (pendingNavigation) {
      goToStep(pendingNavigation);
    }
    setPendingNavigation(null);
  }

  return (
    <>
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background/95 p-4 backdrop-blur-sm md:static md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {!isClosed && activeStepDefinition?.stage && pendingFields.length > 0 && (
          <div className="text-xs">
            <p className="font-medium text-foreground">
              {t('caseWizard.actions.pendingFieldsTitle')}
            </p>
            <ul className="list-inside list-disc text-muted-foreground">
              {pendingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {!isClosed && (
            <Button
              variant="outline"
              onClick={() => void handleSave()}
              disabled={!activeStep || isSaving}
            >
              {t('caseWizard.actions.save')}
            </Button>
          )}
          {!isClosed && activeStepDefinition?.stage && (
            <Button
              variant="secondary"
              onClick={handleCompleteStage}
              disabled={!stageExists || completeStage.isPending}
            >
              {t('caseWizard.actions.completeStage')}
            </Button>
          )}
          <Button onClick={handleNext} disabled={!nextStep || !nextUnlocked}>
            {t('caseWizard.actions.next')}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('caseWizard.actions.unsavedChangesTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('caseWizard.actions.unsavedChangesBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmNavigation}>
              {t('caseWizard.actions.next')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
