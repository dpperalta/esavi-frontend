import { CheckCircle2, Circle, CircleDot, Lock, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/components/ui/accordion';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import {
  CASE_WIZARD_STEPS,
  getPrecedingStepSlug,
  isStepUnlocked,
  stageWorkflowKey,
  type CaseWizardGroup,
  type CaseWizardStepDefinition,
  type CaseWizardStepSlug,
  type CaseWorkflowStages,
} from './steps';

interface CaseWizardStepperProps {
  caseId: string;
  activeSlug: CaseWizardStepSlug;
}

type StepStatus = 'not-started' | 'in-progress' | 'completed';

const STEP_LABEL_KEY: Record<CaseWizardStepSlug, string> = {
  patient: 'caseWizard.steps.patient',
  'case-opening': 'caseWizard.steps.caseOpening',
  classification: 'caseWizard.steps.classification',
  notification: 'caseWizard.steps.notification',
  investigation: 'caseWizard.steps.investigation',
  'final-classification': 'caseWizard.steps.finalClassification',
};

// Only three of the four groups get their own header (§3.8): 'patient' holds a single step
// whose own label already says everything the group heading would.
const GROUP_LABEL_KEY: Partial<Record<CaseWizardGroup, string>> = {
  notification: 'caseWizard.groups.notification',
  investigation: 'caseWizard.groups.investigation',
  closure: 'caseWizard.groups.closure',
};

const GROUP_ORDER: CaseWizardGroup[] = ['patient', 'notification', 'investigation', 'closure'];

const STATUS_LABEL_KEY: Record<StepStatus, string> = {
  'not-started': 'caseWizard.stepStatus.notStarted',
  'in-progress': 'caseWizard.stepStatus.inProgress',
  completed: 'caseWizard.stepStatus.completed',
};

const STATUS_ICON: Record<StepStatus, LucideIcon> = {
  'not-started': Circle,
  'in-progress': CircleDot,
  completed: CheckCircle2,
};

const STATUS_COLOR: Record<StepStatus, string> = {
  'not-started': 'text-muted-foreground',
  'in-progress': 'text-primary',
  completed: 'text-success',
};

function stepStatus(step: CaseWizardStepDefinition, stages: CaseWorkflowStages): StepStatus {
  // Steps 1-2 have no `stage`: reaching this wizard means the case already exists, so they're
  // always behind us (SPEC FE08 §3.1).
  if (!step.stage) return 'completed';
  const entry = stages[stageWorkflowKey(step.stage)];
  if (entry.endedAt) return 'completed';
  if (entry.exists) return 'in-progress';
  return 'not-started';
}

function StepRow({
  caseId,
  step,
  stages,
  isActive,
}: {
  caseId: string;
  step: CaseWizardStepDefinition;
  stages: CaseWorkflowStages;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const status = stepStatus(step, stages);
  const StatusIcon = STATUS_ICON[status];
  const label = t(STEP_LABEL_KEY[step.slug]);

  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <StatusIcon aria-hidden="true" className={cn('size-4 shrink-0', STATUS_COLOR[status])} />
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            'truncate text-sm font-medium',
            isActive ? 'text-primary' : 'text-foreground',
          )}
        >
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{t(STATUS_LABEL_KEY[status])}</span>
      </span>
    </span>
  );

  // Steps 1-2 have no precondition of their own — reaching the wizard at all means the case
  // exists, so they're always unlocked (SPEC FE10 §8) and always rendered as a link.
  const unlocked = !step.stage || isStepUnlocked(step.slug, stages);

  if (!unlocked) {
    const precedingSlug = getPrecedingStepSlug(step.slug);
    const precedingLabel = precedingSlug ? t(STEP_LABEL_KEY[precedingSlug]) : '';
    return (
      <div
        aria-disabled="true"
        className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 opacity-60"
      >
        {content}
        <Lock
          aria-label={t('caseWizard.stepLocked.aria', { stage: precedingLabel })}
          className="ml-auto size-4 shrink-0 text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <Link
      to={`/esavi-cases/${caseId}/wizard/${step.slug}`}
      aria-current={isActive ? 'step' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted',
        isActive && 'bg-primary/8',
      )}
    >
      {content}
    </Link>
  );
}

function GroupSteps({
  caseId,
  steps,
  stages,
  activeSlug,
}: {
  caseId: string;
  steps: CaseWizardStepDefinition[];
  stages: CaseWorkflowStages;
  activeSlug: CaseWizardStepSlug;
}) {
  return (
    <div className="flex flex-col gap-1">
      {steps.map((step) => (
        <StepRow
          key={step.slug}
          caseId={caseId}
          step={step}
          stages={stages}
          isActive={step.slug === activeSlug}
        />
      ))}
    </div>
  );
}

// Four groups, six steps (SPEC FE08 §3.1). Desktop keeps every group expanded — the segments
// with the largest forms go uncollapsed even on wide screens (§3.7); only below `md` do the
// three named groups become an accordion, the active step's group open by default.
export function CaseWizardStepper({ caseId, activeSlug }: CaseWizardStepperProps) {
  const { t } = useTranslation();
  const workflow = useCaseWorkflow(caseId);

  if (!workflow.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const { stages } = workflow.data;
  const activeGroup =
    CASE_WIZARD_STEPS.find((step) => step.slug === activeSlug)?.group ?? 'patient';

  const patientSteps = CASE_WIZARD_STEPS.filter((step) => step.group === 'patient');

  return (
    <nav className="flex flex-col gap-4">
      <GroupSteps caseId={caseId} steps={patientSteps} stages={stages} activeSlug={activeSlug} />

      {/* Desktop: every group expanded, no accordion (§3.7). */}
      <div className="hidden flex-col gap-4 md:flex">
        {GROUP_ORDER.filter((group) => group !== 'patient').map((group) => {
          const steps = CASE_WIZARD_STEPS.filter((step) => step.group === group);
          const labelKey = GROUP_LABEL_KEY[group];
          return (
            <div key={group} className="flex flex-col gap-1">
              {labelKey && (
                <h2 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(labelKey)}
                </h2>
              )}
              <GroupSteps caseId={caseId} steps={steps} stages={stages} activeSlug={activeSlug} />
            </div>
          );
        })}
      </div>

      {/* Mobile: the three named groups collapse, the active step's group starts open. */}
      <Accordion type="multiple" defaultValue={[activeGroup]} className="flex flex-col md:hidden">
        {GROUP_ORDER.filter((group) => group !== 'patient').map((group) => {
          const steps = CASE_WIZARD_STEPS.filter((step) => step.group === group);
          const labelKey = GROUP_LABEL_KEY[group];
          return (
            <AccordionItem key={group} value={group}>
              <AccordionTrigger className="px-3">{labelKey && t(labelKey)}</AccordionTrigger>
              <AccordionContent className="px-3">
                <GroupSteps caseId={caseId} steps={steps} stages={stages} activeSlug={activeSlug} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </nav>
  );
}
