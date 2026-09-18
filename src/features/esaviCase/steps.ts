import type { CaseWorkflowStage } from '@/contracts/caseWorkflow';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';

export type CaseWizardGroup = 'patient' | 'notification' | 'investigation' | 'closure';

// The seven slugs of SPEC FE08 §3.1, plus `closure` (SPEC FE14b §2). English, not a number: a
// saved link (`.../wizard/notification`) stays valid if a later spec splits a step; `.../wizard/4`
// would not (§6).
export type CaseWizardStepSlug =
  | 'patient'
  | 'case-opening'
  | 'classification'
  | 'notification'
  | 'investigation'
  | 'final-classification'
  | 'closure';

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
  // Sin `stage` propio, como los pasos 1-2 (SPEC FE14b §2): no escribe ninguna fila, sólo lee las
  // que ya existen. `stageWorkflowKey` nunca se llama con él.
  { slug: 'closure', group: 'closure', stage: null },
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

// The slugs reachable through /esavi-cases/:id/wizard/:step — now all six (SPEC FE10 §8): steps
// 1-2 stopped being excluded once FE10 gave them a reentry mode. They keep painting as
// «Completado» in the stepper (being in the wizard at all means the case exists) and they keep
// having no `stage`/precondition of their own, so `isStepUnlocked` and `resolveResumeStep` below
// are unaffected — `classification`, the first step with a real precondition, still wins the
// resume walk over them because it comes right after in this same array and is unconditionally
// unlocked too.
export const REACHABLE_WIZARD_STEPS: CaseWizardStepDefinition[] = CASE_WIZARD_STEPS;

export function isReachableStepSlug(value: string): value is CaseWizardStepSlug {
  return REACHABLE_WIZARD_STEPS.some((step) => step.slug === value);
}

// The two flags step 6 (and, for `investigation`, step 5) read from outside their own stage: a
// serious event or a requested investigation, never a `stages.*.exists` alone (SPEC FE14a §1D).
// `null` on either — or the whole object `null` — means "still loading", never "no" (§3.4).
export interface CaseWizardStepFlags {
  isSeriousEvent: boolean | null;
  requestInvestigation: boolean | null;
}

// Paso 5 y 6 sólo existen si el caso los requiere (SPEC FE14a §1D, CASE-PROCESS.md §5.6): el
// stepper no los pinta y una URL directa a uno de ellos redirige. Los demás pasos no dependen de
// ninguna bandera — siempre se requieren. `flags === null` — la lectura de clasificación o de
// notificación todavía pendiente — no oculta nada: mostrar de más no pierde datos, mostrar de
// menos esconde un paso que sí hacía falta (SPEC FE14a §3.4, riesgo 2). Una fila ya creada
// (`stages.<stage>.exists`) mantiene el paso visible aunque las banderas hayan pasado a `false`
// después — no hay forma de ver ni corregir esos datos desde el asistente si el paso desaparece.
export function isStepRequired(
  slug: CaseWizardStepSlug,
  stages: WorkflowStages,
  flags: CaseWizardStepFlags | null,
): boolean {
  if (flags === null) return true;
  if (slug === 'investigation') {
    return flags.requestInvestigation === true || stages.investigation.exists;
  }
  if (slug === 'final-classification') {
    return (
      flags.isSeriousEvent === true ||
      flags.requestInvestigation === true ||
      stages.finalClassification.exists
    );
  }
  return true;
}

// The next step whose door isn't shut by `isStepRequired` (SPEC FE14b §2, §4 paso 8) — never
// `currentIndex + 1` alone, which would land on a hidden step 5/6 or walk past `closure` off the
// end of the array. `flags === null` (still loading) makes every step required (§3.4).
export function findNextRequiredStep(
  currentIndex: number,
  stages: WorkflowStages,
  flags: CaseWizardStepFlags | null,
): CaseWizardStepDefinition | null {
  for (let i = currentIndex + 1; i < CASE_WIZARD_STEPS.length; i++) {
    const step = CASE_WIZARD_STEPS[i];
    if (isStepRequired(step.slug, stages, flags)) return step;
  }
  return null;
}

// Mirror of `findNextRequiredStep` (SPEC FE16 §3.1). Doesn't check `isStepUnlocked`: a preceding
// step is unlocked by definition (SPEC FE16 §6).
export function findPreviousRequiredStep(
  currentIndex: number,
  stages: WorkflowStages,
  flags: CaseWizardStepFlags | null,
): CaseWizardStepDefinition | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const step = CASE_WIZARD_STEPS[i];
    if (isStepRequired(step.slug, stages, flags)) return step;
  }
  return null;
}

// Where /esavi-cases/:id/wizard/:step lands when :step is missing, unrecognized, locked or not
// required (SPEC FE08 §4 plan step 9, SPEC FE14a §4 plan step 4): the most advanced step that's
// both unlocked and required, walked in process order — worst case that's `classification`, which
// has no precondition of its own and is always required. `flags` defaults to `null` so every
// existing caller before SPEC FE14a §4 plan step 5 wires the stepper's two reads keeps compiling
// unchanged — with `flags` unresolved nothing is skipped, same as before this spec.
//
// `closure` is always unlocked and always required (SPEC FE14b §2, §6), so without `isClosed` it
// would win the walk for every single case — the "most advanced step" of an open case would
// always be a checklist instead of whatever work is actually pending. It's skipped unless
// `isClosed`, and `isClosed` defaults to `false` so every caller before this spec keeps compiling
// unchanged — with it unresolved, `closure` stays skipped, same as before.
export function resolveResumeStep(
  stages: WorkflowStages,
  flags: CaseWizardStepFlags | null = null,
  isClosed = false,
): CaseWizardStepSlug {
  let resumeSlug: CaseWizardStepSlug = 'classification';
  for (const step of REACHABLE_WIZARD_STEPS) {
    if (step.slug === 'closure' && !isClosed) continue;
    if (isStepUnlocked(step.slug, stages) && isStepRequired(step.slug, stages, flags)) {
      resumeSlug = step.slug;
    }
  }
  return resumeSlug;
}
