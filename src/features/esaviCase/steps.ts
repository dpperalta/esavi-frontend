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

type WorkflowStages = CaseWorkflowDetail['stages'];

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
