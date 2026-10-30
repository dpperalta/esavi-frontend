import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useCan } from '@/shared/hooks/useCan';
import { STEP_MIN_LEVEL, type CaseWizardStepSlug } from './steps';

export type StepReadOnlyReason = 'closed' | 'role';

export interface StepReadOnlyState {
  isReadOnly: boolean;
  reason: StepReadOnlyReason | null;
}

// The single source of a wizard step's read-only mode (SPEC FE33 §3.5): a closed case or a level
// below STEP_MIN_LEVEL. 'closed' wins over 'role' so the two banners never stack (§3.6). Without a
// case yet (the alta, `caseId` undefined) the workflow query stays off and only the role applies.
export function useStepReadOnly(
  slug: CaseWizardStepSlug,
  caseId: string | undefined,
): StepReadOnlyState {
  // ESAVI-CASEFLOW-006 — status.code
  const workflow = useCaseWorkflow(caseId);
  const canWrite = useCan(STEP_MIN_LEVEL[slug]);

  if (workflow.data?.status.code === 'CLOSED') {
    return { isReadOnly: true, reason: 'closed' };
  }
  if (!canWrite) {
    return { isReadOnly: true, reason: 'role' };
  }
  return { isReadOnly: false, reason: null };
}
