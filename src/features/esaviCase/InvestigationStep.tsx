import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { NotificationDetail } from '@/contracts/declared/notification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { BasicInfoSection } from '@/features/investigation/BasicInfoSection';
import { SourceSection } from '@/features/investigation/SourceSection';
import { TeamMemberList } from '@/features/investigation/TeamMemberList';
import {
  investigationByCaseKey,
  investigationResource,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationSourceByCase,
} from '@/features/investigation/api';
import type {
  InvestigationAutopsyFormValues,
  InvestigationFormValues,
  InvestigationSourceFormValues,
} from '@/features/investigation/schemas';
import { useNotificationByCase } from '@/features/notification/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useProgressiveSections } from '@/shared/hooks/useProgressiveSections';
import { resolveDraftConflict, useDraftsStore } from '@/shared/stores/draftsStore';

function InvestigationStepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

interface InvestigationCreateErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

// State of its own per §3.8: if the empty `POST` that creates the header fails, there's no row
// yet to hang any form on — the error shows with a retry, never the three sections half-built.
function InvestigationCreateErrorState({ error, onRetry }: InvestigationCreateErrorStateProps) {
  const { t } = useTranslation();
  const message =
    error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected');

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t('investigation.error.createFailed')}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

type InvestigationSectionId = 'source' | 'basicInfo' | 'team';
const SECTIONS: InvestigationSectionId[] = ['source', 'basicInfo', 'team'];

// The combined draft (§3.4): a single `'investigation'` key, even though three self-contained
// sections write into it — every field is optional because the user may have touched only one
// section before the accidental tab close.
interface InvestigationDraftValues {
  source?: InvestigationSourceFormValues;
  basicInfo?: InvestigationFormValues;
  autopsy?: InvestigationAutopsyFormValues;
}

interface InvestigationStepBodyProps {
  caseId: string;
  investigationId: string;
  investigation: InvestigationDetail;
  investigationSource: InvestigationSourceDetail | null;
  investigationAutopsy: InvestigationAutopsyDetail | null;
  notification: NotificationDetail | null;
  // `stages.investigation.exists` as `InvestigationStep` read it before its own `POST`
  // (SPEC FE12f §3.1, adapted): a fresh step is walked through section by section; one that
  // already existed shows in full from the first render.
  existedOnMount: boolean;
  isClosed: boolean;
}

function InvestigationStepBody({
  caseId,
  investigationId,
  investigation,
  investigationSource,
  investigationAutopsy,
  notification,
  existedOnMount,
  isClosed,
}: InvestigationStepBodyProps) {
  const { t } = useTranslation();

  // The header's `updatedAt` on mount (SPEC FE12a §3.4, adapted to a draft that covers three
  // sections at once): never recalculated, or the conflict rule would always compare against
  // itself.
  const baseUpdatedAtRef = useRef(investigation.updatedAt);

  // Resolved once, on this body's first render — which only mounts once the header and the
  // three satellites have already loaded, so `NotificationStep`'s `hasResolvedDraftRef` guard
  // isn't needed here: there's no intermediate second render with half-arrived data.
  const [draft] = useState(() => {
    const stored = useDraftsStore.getState().get(caseId, 'investigation');
    const resolution = resolveDraftConflict(stored, baseUpdatedAtRef.current);
    return { resolution, values: (stored?.values as InvestigationDraftValues | undefined) ?? {} };
  });

  const hasNotifiedDraftRef = useRef(false);
  useEffect(() => {
    if (hasNotifiedDraftRef.current) return;
    hasNotifiedDraftRef.current = true;
    if (draft.resolution === 'discard') {
      useDraftsStore.getState().clear(caseId, 'investigation');
      toast.info(t('investigation.draft.discarded'));
    } else if (draft.resolution === 'restore') {
      toast.info(t('investigation.draft.restored'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoredValues = draft.resolution === 'restore' ? draft.values : {};

  const [pendingDraftValues, setPendingDraftValues] = useState<InvestigationDraftValues>({});
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingDraftValues = Object.keys(pendingDraftValues).length > 0;

  // A single 500ms debounce for the three sections (SPEC FE12a §3.4), even though each has its
  // own `useForm`: any change in any of them resets the same timer.
  useEffect(() => {
    if (!hasPendingDraftValues) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      useDraftsStore.getState().set(caseId, 'investigation', pendingDraftValues, baseUpdatedAtRef.current);
    }, 500);
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, [caseId, pendingDraftValues, hasPendingDraftValues]);

  // "Cleared as soon as the PUT responds" (§3.4): after either of the two saves, what was already
  // written is now in the database, and whatever's left untouched doesn't need to survive an
  // accidental close over data that's already history.
  function clearDraft() {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    setPendingDraftValues({});
    useDraftsStore.getState().clear(caseId, 'investigation');
  }

  const revealAllRef = useRef(existedOnMount || isClosed);
  const { isVisible, frontier, advance } = useProgressiveSections<InvestigationSectionId>({
    sections: SECTIONS,
    revealAll: revealAllRef.current,
    lastWithButton: 'basicInfo',
  });

  return (
    <div className="flex flex-col gap-6">
      {isVisible('source') && (
        <SourceSection
          caseId={caseId}
          investigationId={investigationId}
          investigationSource={investigationSource}
          disabled={isClosed}
          showSaveButton={frontier === 'source'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.source}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, source: values }))
          }
        />
      )}

      {isVisible('basicInfo') && (
        <BasicInfoSection
          caseId={caseId}
          investigationId={investigationId}
          investigation={investigation}
          investigationAutopsy={investigationAutopsy}
          notification={notification}
          disabled={isClosed}
          showSaveButton={frontier === 'basicInfo'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={{ basicInfo: restoredValues.basicInfo ?? {}, autopsy: restoredValues.autopsy ?? {} } as {
            basicInfo: InvestigationFormValues;
            autopsy: InvestigationAutopsyFormValues;
          }}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({
              ...current,
              basicInfo: values.basicInfo,
              autopsy: values.autopsy,
            }))
          }
        />
      )}

      {isVisible('team') && <TeamMemberList investigationId={investigationId} disabled={isClosed} />}
    </div>
  );
}

export interface InvestigationStepProps {
  caseId: string;
}

// Wizard step 5 (SPEC FE13a). Replaces the `investigation` slug's placeholder in `CaseWizardPage`
// (FE08, §4 step 9). Creates the header on entry (§2) and mounts the three sections from §4
// steps 7-10 under FE12f's progressive reveal (§4 step 11): sources, basic info with the death
// and autopsy block, and team — no route sub-step of its own.
export function InvestigationStep({ caseId }: InvestigationStepProps) {
  const queryClient = useQueryClient();
  const workflow = useCaseWorkflow(caseId);
  const stageExists = workflow.data?.stages.investigation.exists === true;
  const investigation = useInvestigationByCase(caseId, stageExists);
  const investigationSource = useInvestigationSourceByCase(caseId, stageExists);
  const investigationAutopsy = useInvestigationAutopsyByCase(caseId, stageExists);
  const notificationStageExists = workflow.data?.stages.notification.exists === true;
  const notification = useNotificationByCase(caseId, notificationStageExists);
  const create = investigationResource.useCreate();

  // Guards against a second `POST` on the same mount — StrictMode's double effect in dev, or a
  // new render while the mutation is still in flight (§5 criterion: "a single POST"). Cleared by
  // hand in `handleRetry`, never by an effect depending on `create`.
  const attemptedCaseIdRef = useRef<string | null>(null);

  function createHeader() {
    attemptedCaseIdRef.current = caseId;
    create.mutate(
      { caseId },
      {
        onSuccess: (created) => {
          queryClient.setQueryData(investigationByCaseKey(caseId), created);
          // `stages.investigation.exists` just changed — without this the stepper and resume
          // logic would keep seeing step 5 as not started (SPEC FE13a §3.4).
          void queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
        },
      },
    );
  }

  useEffect(() => {
    if (!workflow.data || stageExists) {
      return;
    }
    if (attemptedCaseIdRef.current === caseId) {
      return;
    }
    createHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.data, stageExists, caseId]);

  function handleRetry() {
    attemptedCaseIdRef.current = null;
    create.reset();
    createHeader();
  }

  // Frozen the first time the workflow responds (SPEC FE12f §3.1, adapted): the effect above can
  // flip `stageExists` to `true` a moment later with its own `POST`, and the progressive reveal
  // has to ignore that change — only whether the header **already** existed before this step did
  // anything matters.
  const existedOnMountRef = useRef<boolean | null>(null);
  if (workflow.data && existedOnMountRef.current === null) {
    existedOnMountRef.current = stageExists;
  }

  if (!workflow.data) {
    return <InvestigationStepSkeleton />;
  }

  if (!stageExists) {
    if (create.isError) {
      return <InvestigationCreateErrorState error={create.error} onRetry={handleRetry} />;
    }
    return <InvestigationStepSkeleton />;
  }

  if (
    investigation.isLoading ||
    !investigation.data ||
    investigationSource.isLoading ||
    investigationAutopsy.isLoading
  ) {
    return <InvestigationStepSkeleton />;
  }

  return (
    <InvestigationStepBody
      caseId={caseId}
      investigationId={investigation.data.investigationId}
      investigation={investigation.data}
      investigationSource={investigationSource.data ?? null}
      investigationAutopsy={investigationAutopsy.data ?? null}
      notification={notification.data ?? null}
      existedOnMount={existedOnMountRef.current ?? false}
      isClosed={workflow.data.status.code === 'CLOSED'}
    />
  );
}
