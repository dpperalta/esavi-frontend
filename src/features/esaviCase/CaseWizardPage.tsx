import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { PatientStep } from '@/features/patient/PatientStep';
import { esaviCaseResource } from './api';
import { CaseOpeningStep } from './CaseOpeningStep';
import { CaseWizardActionBar } from './CaseWizardActionBar';
import { CaseWizardProvider } from './CaseWizardContext';
import { CaseWizardHeader } from './CaseWizardHeader';
import { CaseWizardStepper } from './CaseWizardStepper';
import { ClassificationStep } from './ClassificationStep';
import {
  CaseWorkflowErrorScreen,
  hasDedicatedCaseWorkflowErrorScreen,
} from './CaseWorkflowErrorScreen';
import { isReachableStepSlug, isStepUnlocked, resolveResumeStep } from './steps';

function CaseWizardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:flex-row md:gap-8 md:p-6">
      <div className="flex flex-col gap-3 md:w-72 md:shrink-0">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function CaseWizardGenericError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const message =
    error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected');

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t('caseWizard.error.generic')}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

// SPEC FE08 §3.1, §4 plan step 9. Assembles header + stepper + step placeholder + action bar;
// resolves reanudación and the locked-step guard from ESAVI-CASEFLOW-006's `stages`.
export function CaseWizardPage() {
  const { t } = useTranslation();
  const { id, step } = useParams<{ id: string; step?: string }>();

  const workflow = useCaseWorkflow(id);
  const caseDetail = esaviCaseResource.useOne(id ?? '');

  if (!id) {
    return <Navigate to="/esavi-cases" replace />;
  }

  if (workflow.isLoading || caseDetail.isLoading) {
    return <CaseWizardSkeleton />;
  }

  const activeError = workflow.error ?? caseDetail.error;
  if (activeError) {
    if (
      workflow.isError &&
      activeError instanceof EsaviApiError &&
      hasDedicatedCaseWorkflowErrorScreen(activeError.code)
    ) {
      return <CaseWorkflowErrorScreen error={activeError} caseId={id} />;
    }
    return (
      <CaseWizardGenericError
        error={activeError}
        onRetry={() => {
          void workflow.refetch();
          void caseDetail.refetch();
        }}
      />
    );
  }

  if (!workflow.data || !caseDetail.data) {
    return <CaseWizardSkeleton />;
  }

  const { stages, status } = workflow.data;
  const isClosed = status.code === 'CLOSED';

  // Reanudación (no `:step`) and the locked/invalid-step guard both land on the same place:
  // the most advanced unlocked step (SPEC FE08 §4 plan step 9).
  if (!step || !isReachableStepSlug(step) || !isStepUnlocked(step, stages)) {
    const resumeSlug = resolveResumeStep(stages);
    return <Navigate to={`/esavi-cases/${id}/wizard/${resumeSlug}`} replace />;
  }

  return (
    <CaseWizardProvider>
      <div className="flex flex-col gap-6 p-4 pb-28 md:flex-row md:gap-8 md:p-6 md:pb-6">
        <aside className="md:w-72 md:shrink-0">
          <CaseWizardStepper caseId={id} activeSlug={step} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CaseWizardHeader caseId={id} />

          {isClosed && (
            <div
              role="status"
              className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
            >
              {t('caseWizard.readOnly.closedBanner')}
            </div>
          )}

          {/* patient y case-opening llevan su propia barra de acciones — Continuar / Crear caso
              · Guardar · Siguiente (SPEC FE10 §2) — y no tienen `stage`, así que la barra
              genérica (Guardar · Completar etapa · Siguiente, atada a `useCaseWizard()`) no se
              pinta para ellos. */}
          {step === 'patient' && <PatientStep patientId={caseDetail.data.patient.patientId} />}
          {step === 'case-opening' && <CaseOpeningStep />}
          {step === 'classification' && <ClassificationStep caseId={id} />}
          {step !== 'patient' && step !== 'case-opening' && step !== 'classification' && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {step}
            </div>
          )}

          {step !== 'patient' && step !== 'case-opening' && (
            <CaseWizardActionBar caseId={id} activeSlug={step} />
          )}
        </div>
      </div>
    </CaseWizardProvider>
  );
}
