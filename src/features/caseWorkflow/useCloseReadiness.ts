import type { UseQueryResult } from '@tanstack/react-query';
// SPEC FE14b §2, §3.2, §6 — a deliberate exception to CONVENTIONS.md §3 ("una feature no importa
// de otra feature"): the spec's whole point is to reuse the eight read hooks that already exist
// per phase, sharing their cache key with the step that wrote the row, instead of adding a ninth
// "can this case close?" endpoint the backend would have to own (§6, decision "sí: se reutilizan
// los ocho hooks de lectura existentes"). `closeReadiness.ts` stays pure and feature-agnostic;
// this hook is the one file allowed to cross those four boundaries.
import { useClassificationByCase } from '@/features/classification/api';
import { useFinalClassificationByCase } from '@/features/finalClassification/api';
import {
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationCommunityByCase,
} from '@/features/investigation/api';
import { useNotificationByCase, useNotificationMedicationsByCase } from '@/features/notification/api';
import { EsaviApiError } from '@/shared/api/types';
import { useCaseWorkflow } from './api';
import {
  type CloseReadiness,
  type CloseReadinessInput,
  type CommunityRow,
  type NotificationRow,
  type PhaseRow,
  evaluateCloseReadiness,
} from './closeReadiness';

// A resolved phase read, before it's folded into a `PhaseRow`: `'loading'`/`'error'` are states
// the pure function never sees (§3.5 — `evaluateCloseReadiness` only runs once every enabled
// read has an answer).
type ResolvedPhase<T> = PhaseRow<T> | 'loading' | 'error';

// `exists` gates the query itself (`enabled`), so a phase that hasn't started yet never fires a
// request. Once `exists` is true, a `notFoundCode` error means "deactivated" (§2, hallazgo D):
// the row is there but hidden from a USER; an ADMIN instead gets the row back with `isActive:
// false`, handled by the caller passing `isRowActive`.
function resolveThrowingPhase<T>(
  exists: boolean,
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isError' | 'isPending'>,
  notFoundCode: string,
  isRowActive: (row: T) => boolean,
): ResolvedPhase<T> {
  if (!exists) return null;
  if (query.isPending) return 'loading';
  if (query.isError) {
    if (query.error instanceof EsaviApiError && query.error.code === notFoundCode) return 'deactivated';
    return 'error';
  }
  if (query.data === undefined) return 'loading';
  return isRowActive(query.data) ? query.data : 'deactivated';
}

// Autopsy and community already swallow their own `_006_NOT_FOUND` into `null` in their hooks
// (SPEC FE13a/FE13e), because for their own screens `null` legitimately means "not answered yet"
// — not every investigation has an autopsy or a community count. Neither carries its own
// `isActive`; both inherit it from the parent investigation (`row.investigation.isActive`), so a
// deactivated investigation surfaces here the same way it does in the `investigation` precondition
// line, and this function only needs to decide "is there an active row at all", never a distinct
// 'deactivated' state of its own (SPEC FE14b §3.3 — only used through `isActive()`).
function resolveNestedPhase<T extends { investigation: { isActive: boolean } }>(
  exists: boolean,
  query: Pick<UseQueryResult<T | null>, 'data' | 'error' | 'isError' | 'isPending'>,
): ResolvedPhase<T> {
  if (!exists) return null;
  if (query.isPending) return 'loading';
  if (query.isError) return 'error';
  if (query.data === undefined) return 'loading';
  if (query.data === null) return null;
  return query.data.investigation.isActive ? query.data : 'deactivated';
}

function isLoading(...phases: ResolvedPhase<unknown>[]): boolean {
  return phases.some((phase) => phase === 'loading');
}

function hasError(...phases: ResolvedPhase<unknown>[]): boolean {
  return phases.some((phase) => phase === 'error');
}

function settled<T>(phase: ResolvedPhase<T>): PhaseRow<T> {
  return phase === 'loading' || phase === 'error' ? null : phase;
}

// SPEC FE14b §3.2, §3.4, plan step 3 — the eight lectures the closure step needs, each `enabled`
// by its own phase's `exists` (never a hardcoded `true`), folded into the shape
// `evaluateCloseReadiness` expects. Nothing here is stored: TanStack Query is the only cache, and
// `status`/`lines`/`canClose` are recomputed on every render (§3.4, "una excepción declarada").
export function useCloseReadiness(caseId: string | undefined): CloseReadiness {
  const workflow = useCaseWorkflow(caseId);
  const stages = workflow.data?.stages;

  const classificationExists = stages?.classification.exists ?? false;
  const notificationExists = stages?.notification.exists ?? false;
  const investigationExists = stages?.investigation.exists ?? false;
  const finalClassificationExists = stages?.finalClassification.exists ?? false;

  const classificationQuery = useClassificationByCase(caseId, classificationExists);
  const notificationQuery = useNotificationByCase(caseId, notificationExists);
  const investigationQuery = useInvestigationByCase(caseId, investigationExists);
  const finalClassificationQuery = useFinalClassificationByCase(caseId, finalClassificationExists);
  const autopsyQuery = useInvestigationAutopsyByCase(caseId, investigationExists);
  const communityQuery = useInvestigationCommunityByCase(caseId, investigationExists);

  const classification = resolveThrowingPhase(
    classificationExists,
    classificationQuery,
    'CLASSIF_006_NOT_FOUND',
    (row) => row.isActive,
  );
  const notification = resolveThrowingPhase(
    notificationExists,
    notificationQuery,
    'NOTIFCN_006_NOT_FOUND',
    (row) => row.isActive,
  );
  const investigation = resolveThrowingPhase(
    investigationExists,
    investigationQuery,
    'INVESTGN_006_NOT_FOUND',
    (row) => row.isActive,
  );
  const finalClassification = resolveThrowingPhase(
    finalClassificationExists,
    finalClassificationQuery,
    'FINCLASS_006_NOT_FOUND',
    (row) => row.isActive,
  );
  const autopsy = resolveNestedPhase(investigationExists, autopsyQuery);
  const community = resolveNestedPhase<CommunityRow & { investigation: { isActive: boolean } }>(
    investigationExists,
    communityQuery,
  );

  // `medicationAnswer` only ever warns when `takesMedication !== 'YES'` (§3.5): with 'YES', the
  // check is either not applicable (no active medication) or met, and never something the screen
  // needs to surface — so the medication list is worth fetching only in the branch where it can
  // actually change what's shown. This is what keeps a minimal case (classification + notification
  // only, answered 'YES') at exactly the three requests §5's acceptance criterion counts, instead
  // of a fourth that could never affect `canClose` or the rendered lines either way. Waits for
  // `notification` to settle first — firing on `notificationExists` alone would start the request
  // before `takesMedication` is known and defeat the point.
  const activeNotification =
    notification !== null && notification !== 'deactivated' && notification !== 'loading' && notification !== 'error'
      ? notification
      : undefined;
  const medicationsEnabled = activeNotification !== undefined && activeNotification.takesMedication !== 'YES';
  const medicationsQuery = useNotificationMedicationsByCase(caseId, medicationsEnabled);

  const medicationsLoading = medicationsEnabled && medicationsQuery.isPending;
  const medicationsErrored = medicationsEnabled && medicationsQuery.isError;
  const hasActiveMedication =
    medicationsEnabled && (medicationsQuery.data?.rows.some((medication) => medication.isActive) ?? false);

  if (
    isLoading(classification, notification, investigation, finalClassification, autopsy, community) ||
    medicationsLoading ||
    (workflow.isPending && caseId !== undefined)
  ) {
    return { status: 'loading', lines: [], canClose: false };
  }

  if (
    hasError(classification, notification, investigation, finalClassification, autopsy, community) ||
    medicationsErrored ||
    workflow.isError
  ) {
    return { status: 'error', lines: [], canClose: false };
  }

  const input: CloseReadinessInput = {
    statusCode: workflow.data?.status?.code ?? '',
    classification: settled(classification),
    notification: toNotificationRow(settled(notification)),
    investigation: settled(investigation),
    finalClassification: settled(finalClassification),
    autopsy: settled(autopsy),
    community: toCommunityRow(settled(community)),
    hasActiveMedication,
  };

  return { status: 'ready', ...evaluateCloseReadiness(input) };
}

// The read hooks answer the full contract row; the pure function only wants the fields it
// compares (SPEC FE14b §3.3). Narrowed here, next to the one place that reads the raw response,
// instead of inside `closeReadiness.ts`, which never sees the contract types.
function toNotificationRow(
  row: PhaseRow<{
    requestInvestigation: boolean;
    notificationType: string;
    takesMedication: string | null;
    outcome: { value: string | null } | null;
  }>,
): PhaseRow<NotificationRow> {
  if (row === null || row === 'deactivated') return row;
  return {
    requestInvestigation: row.requestInvestigation,
    notificationType: row.notificationType,
    takesMedication: row.takesMedication,
    outcomeValue: row.outcome?.value ?? null,
  };
}

function toCommunityRow(
  row: PhaseRow<{
    similarEventCount: number | null;
    affectedVaccinated: number | null;
    affectedUnvaccinated: number | null;
    affectedUnknown: number | null;
  }>,
): PhaseRow<CommunityRow> {
  if (row === null || row === 'deactivated') return row;
  return {
    similarEventCount: row.similarEventCount,
    affectedVaccinated: row.affectedVaccinated,
    affectedUnvaccinated: row.affectedUnvaccinated,
    affectedUnknown: row.affectedUnknown,
  };
}
