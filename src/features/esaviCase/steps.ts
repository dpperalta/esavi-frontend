import type { CaseWorkflowStage } from '@/contracts/caseWorkflow';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';

export type CaseWizardGroup = 'patient' | 'notification' | 'investigation' | 'closure';

// The six slugs of SPEC FE08 §3.1. English, not a number: a saved link (`.../wizard/notification`)
// stays valid if a later spec splits a step; `.../wizard/4` would not (§6).
export type CaseWizardStepSlug =
  | 'patient'
  | 'case-opening'
  | 'classification'
  | 'notification'
  | 'investigation'
  | 'final-classification';

export interface CaseWizardStepDefinition {
  slug: CaseWizardStepSlug;
  group: CaseWizardGroup;
  // null for steps 1-2: they run before `caseWorkflow` exists (CASE-PROCESS.md §1) and are
  // reached only through /esavi-cases/new, never through /esavi-cases/:id/wizard/:step.
  stage: CaseWorkflowStage | null;
}

// Data, not JSX — same pattern as navigation.ts (CONVENTIONS.md §10.5).
export const CASE_WIZARD_STEPS: CaseWizardStepDefinition[] = [
  { slug: 'patient', group: 'patient', stage: null },
  { slug: 'case-opening', group: 'notification', stage: null },
  { slug: 'classification', group: 'notification', stage: 'CLASSIFICATION' },
  { slug: 'notification', group: 'notification', stage: 'NOTIFICATION' },
  { slug: 'investigation', group: 'investigation', stage: 'INVESTIGATION' },
  { slug: 'final-classification', group: 'closure', stage: 'FINAL_CLASSIFICATION' },
];

export type CaseWorkflowStages = CaseWorkflowDetail['stages'];
type WorkflowStages = CaseWorkflowStages;

// Unlocking hangs off the real precondition of each stage, never off a strict 3→4→5→6 chain
// (SPEC FE08 §6): a strict chain would require `investigation` to close a serious case, which
// CASE-PROCESS.md §4.4 does not — it only requires `finalClassification`, so step 5 cannot be a
// toll booth for step 6. `classification` has no precondition of its own: reaching the wizard
// already means the case (and therefore the workflow) exists.
const STAGE_PRECONDITION: Partial<Record<CaseWizardStepSlug, keyof WorkflowStages>> = {
  notification: 'classification',
  investigation: 'notification',
  'final-classification': 'notification',
};

export function isStepUnlocked(slug: CaseWizardStepSlug, stages: WorkflowStages): boolean {
  const precondition = STAGE_PRECONDITION[slug];
  if (!precondition) return true;
  return stages[precondition].exists;
}

// keyof WorkflowStages is camelCase (SPEC FE08 §3.3); CASE_WIZARD_STEPS' slugs are kebab-case
// and 'final-classification' doesn't share a spelling with 'finalClassification' at all, so the
// two can't be derived from one another by string manipulation.
const WORKFLOW_STAGE_KEY_TO_SLUG: Record<keyof WorkflowStages, CaseWizardStepSlug> = {
  classification: 'classification',
  notification: 'notification',
  investigation: 'investigation',
  finalClassification: 'final-classification',
};

// The step whose completion unlocks `slug` — what the padlock's aria-label names (§3.7).
// null when `slug` has no precondition of its own (patient, case-opening, classification).
export function getPrecedingStepSlug(slug: CaseWizardStepSlug): CaseWizardStepSlug | null {
  const precondition = STAGE_PRECONDITION[slug];
  return precondition ? WORKFLOW_STAGE_KEY_TO_SLUG[precondition] : null;
}

const STAGE_TO_WORKFLOW_KEY: Record<CaseWorkflowStage, keyof WorkflowStages> = {
  CLASSIFICATION: 'classification',
  NOTIFICATION: 'notification',
  INVESTIGATION: 'investigation',
  FINAL_CLASSIFICATION: 'finalClassification',
};

// The `stages` entry a step's own `CaseWorkflowStage` reads from — not the precondition it
// unlocks on (that's `getPrecedingStepSlug`), but the step's own progress.
export function stageWorkflowKey(stage: CaseWorkflowStage): keyof WorkflowStages {
  return STAGE_TO_WORKFLOW_KEY[stage];
}

// The slugs reachable through /esavi-cases/:id/wizard/:step — steps 1-2 never are (§3.1).
export const REACHABLE_WIZARD_STEPS: CaseWizardStepDefinition[] = CASE_WIZARD_STEPS.filter(
  (step) => step.stage !== null,
);

export function isReachableStepSlug(value: string): value is CaseWizardStepSlug {
  return REACHABLE_WIZARD_STEPS.some((step) => step.slug === value);
}

// Where /esavi-cases/:id/wizard/:step lands when :step is missing, unrecognized, or locked
// (SPEC FE08 §4 plan step 9): the most advanced step that's actually unlocked, walked in
// process order — worst case that's `classification`, which has no precondition of its own.
export function resolveResumeStep(stages: WorkflowStages): CaseWizardStepSlug {
  let resumeSlug: CaseWizardStepSlug = 'classification';
  for (const step of REACHABLE_WIZARD_STEPS) {
    if (isStepUnlocked(step.slug, stages)) {
      resumeSlug = step.slug;
    }
  }
  return resumeSlug;
}
