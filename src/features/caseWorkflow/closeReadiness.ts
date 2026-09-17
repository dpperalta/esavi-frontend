// SPEC FE14b §2, §3.3, §3.5 — pure evaluation of the eleven close preconditions/incoherences.
// No hooks, no `client`, no react: it's tested rule by rule without MSW or a render.
//
// `CloseCheckStepSlug` repeats CASE_WIZARD_STEPS' six slug spellings by hand instead of importing
// `CaseWizardStepSlug` from `features/esaviCase/steps.ts` — a feature doesn't import another
// feature's type (CONVENTIONS.md §3), and this one has no `contracts/` home either: it's client
// routing, not backend contract. `ClosureStep.tsx` is the one place that maps a `CloseCheckLine`'s
// `step` back onto a real route.
export type CloseCheckStepSlug =
  | 'classification'
  | 'notification'
  | 'investigation'
  | 'final-classification';

export type CloseCheckId =
  | 'notPendingValidation'
  | 'classification'
  | 'notification'
  | 'investigation'
  | 'finalClassification'
  | 'autopsyWithoutDeath'
  | 'severityMismatch'
  | 'medicationAnswer'
  | 'communityCount';

export type CloseCheckKind = 'precondition' | 'blocker' | 'warning';
export type CloseCheckState = 'met' | 'unmet' | 'deactivated';

export interface CloseCheckLine {
  id: CloseCheckId;
  kind: CloseCheckKind;
  state: CloseCheckState;
  links: { step: CloseCheckStepSlug; labelKey: string }[];
}

export interface CloseReadiness {
  status: 'loading' | 'error' | 'ready';
  lines: CloseCheckLine[];
  canClose: boolean;
}

// A phase row as `useCloseReadiness` resolves it (SPEC FE14b §3.3): `null` when the phase
// doesn't exist, `'deactivated'` when it exists but its row (or the investigation it hangs off,
// for autopsy/community) isn't active, and the object itself when it's active. A `'deactivated'`
// row carries no data — the whole point is that it can't be trusted, so nothing downstream reads
// through it.
export type PhaseRow<T> = T | null | 'deactivated';

export interface ClassificationRow {
  isSeriousEvent: boolean | null;
}

export interface NotificationRow {
  requestInvestigation: boolean | null;
  notificationType: string;
  takesMedication: string | null;
  outcomeValue: string | null;
}

export interface CommunityRow {
  similarEventCount: number | null;
  affectedVaccinated: number | null;
  affectedUnvaccinated: number | null;
  affectedUnknown: number | null;
}

export interface CloseReadinessInput {
  statusCode: string;
  classification: PhaseRow<ClassificationRow>;
  notification: PhaseRow<NotificationRow>;
  investigation: PhaseRow<unknown>;
  finalClassification: PhaseRow<unknown>;
  autopsy: PhaseRow<unknown>;
  community: PhaseRow<CommunityRow>;
  // Already filtered to the active rows (SPEC FE14b §3.4): the pure function only needs to know
  // whether at least one exists, not the medications themselves.
  hasActiveMedication: boolean;
}

function isActive<T>(row: PhaseRow<T>): row is T {
  return row !== null && row !== 'deactivated';
}

function preconditionState(row: PhaseRow<unknown>): CloseCheckState {
  if (row === null) return 'unmet';
  if (row === 'deactivated') return 'deactivated';
  return 'met';
}

function blockerState(met: boolean): CloseCheckState {
  return met ? 'met' : 'unmet';
}

const CLASSIFICATION_LINK = { step: 'classification' as const, labelKey: 'caseWorkflow.close.links.classification' };
const NOTIFICATION_LINK = { step: 'notification' as const, labelKey: 'caseWorkflow.close.links.notification' };
const INVESTIGATION_LINK = { step: 'investigation' as const, labelKey: 'caseWorkflow.close.links.investigation' };
const FINAL_CLASSIFICATION_LINK = {
  step: 'final-classification' as const,
  labelKey: 'caseWorkflow.close.links.finalClassification',
};

// SPEC FE14b §3.5 — the nine rules, in the order they're painted. A rule that doesn't apply to
// this case is left out of `lines` entirely (`applies: false`), never shown as "met" by default.
export function evaluateCloseReadiness(
  input: CloseReadinessInput,
): Pick<CloseReadiness, 'lines' | 'canClose'> {
  const classification = isActive(input.classification) ? input.classification : undefined;
  const notification = isActive(input.notification) ? input.notification : undefined;

  const lines: CloseCheckLine[] = [];

  lines.push({
    id: 'notPendingValidation',
    kind: 'precondition',
    state: input.statusCode !== 'PENDING_VALIDATION' ? 'met' : 'unmet',
    links: [],
  });

  lines.push({
    id: 'classification',
    kind: 'precondition',
    state: preconditionState(input.classification),
    links: [CLASSIFICATION_LINK],
  });

  lines.push({
    id: 'notification',
    kind: 'precondition',
    state: preconditionState(input.notification),
    links: [NOTIFICATION_LINK],
  });

  if (notification?.requestInvestigation === true) {
    lines.push({
      id: 'investigation',
      kind: 'precondition',
      state: preconditionState(input.investigation),
      links: [INVESTIGATION_LINK],
    });
  }

  if (classification?.isSeriousEvent === true || notification?.requestInvestigation === true) {
    lines.push({
      id: 'finalClassification',
      kind: 'precondition',
      state: preconditionState(input.finalClassification),
      links: [FINAL_CLASSIFICATION_LINK],
    });
  }

  // Sin notificación activa no hay desenlace, ni gravedad declarada, ni `takesMedication` contra
  // los que comparar — una precondición incumplida arrastra sus incoherencias (§3.5).
  if (notification && isActive(input.autopsy)) {
    lines.push({
      id: 'autopsyWithoutDeath',
      kind: 'blocker',
      state: blockerState(notification.outcomeValue === 'DEATH'),
      links: [
        { step: 'notification', labelKey: 'caseWorkflow.close.links.fixOutcome' },
        { step: 'investigation', labelKey: 'caseWorkflow.close.links.reviewAutopsy' },
      ],
    });
  }

  if (classification && notification) {
    lines.push({
      id: 'severityMismatch',
      kind: 'blocker',
      // `null` counts as not serious (SPEC FE14b §6): the same criterion the `008` uses to
      // decide whether it requires step 6.
      state: blockerState(
        (classification.isSeriousEvent === true) === (notification.notificationType === 'SEVERE'),
      ),
      links: [CLASSIFICATION_LINK],
    });
  }

  if (notification && input.hasActiveMedication) {
    lines.push({
      id: 'medicationAnswer',
      kind: 'warning',
      state: blockerState(notification.takesMedication === 'YES'),
      links: [NOTIFICATION_LINK],
    });
  }

  const community = isActive(input.community) ? input.community : undefined;
  const {
    similarEventCount = null,
    affectedVaccinated = null,
    affectedUnvaccinated = null,
    affectedUnknown = null,
  } = community ?? {};
  const communityCountsComplete =
    similarEventCount !== null &&
    affectedVaccinated !== null &&
    affectedUnvaccinated !== null &&
    affectedUnknown !== null;

  if (isActive(input.investigation) && communityCountsComplete) {
    lines.push({
      id: 'communityCount',
      kind: 'warning',
      state: blockerState(affectedVaccinated + affectedUnvaccinated + affectedUnknown === similarEventCount),
      links: [INVESTIGATION_LINK],
    });
  }

  const canClose = lines.every((line) => line.kind === 'warning' || line.state === 'met');

  return { lines, canClose };
}
