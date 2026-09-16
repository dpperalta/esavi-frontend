import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationClinicalEvaluationDetail } from '@/contracts/declared/investigationClinicalEvaluation';
import type { InvestigationColdChainDetail } from '@/contracts/declared/investigationColdChain';
import type { InvestigationMedicalHistoryDetail } from '@/contracts/declared/investigationMedicalHistory';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { InvestigationVaccinationContextDetail } from '@/contracts/declared/investigationVaccinationContext';
import type { NotificationDetail } from '@/contracts/declared/notification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useClassificationByCase } from '@/features/classification/api';
import { esaviCaseResource } from '@/features/esaviCase/api';
import { BasicInfoSection } from '@/features/investigation/BasicInfoSection';
import { ClinicalEvaluationSection } from '@/features/investigation/ClinicalEvaluationSection';
import { ColdChainSection } from '@/features/investigation/ColdChainSection';
import { DiagnosticList } from '@/features/investigation/DiagnosticList';
import { EvaluationInstitutionList } from '@/features/investigation/EvaluationInstitutionList';
import { MedicalHistorySection } from '@/features/investigation/MedicalHistorySection';
import { PregnancySection } from '@/features/investigation/PregnancySection';
import { SourceSection } from '@/features/investigation/SourceSection';
import { TeamMemberList } from '@/features/investigation/TeamMemberList';
import { VaccinationContextSection } from '@/features/investigation/VaccinationContextSection';
import { VaccineAdministeredList } from '@/features/investigation/VaccineAdministeredList';
import {
  investigationByCaseKey,
  investigationResource,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationColdChainByCase,
  investigationDiagnosticsByCaseKey,
  useInvestigationClinicalEvaluationByCase,
  useInvestigationMedicalHistoryByCase,
  useInvestigationSourceByCase,
  useInvestigationVaccinationContextByCase,
} from '@/features/investigation/api';
import type {
  InvestigationAutopsyFormValues,
  InvestigationClinicalEvaluationFormValues,
  InvestigationColdChainFormValues,
  InvestigationFormValues,
  InvestigationSourceFormValues,
  InvestigationVaccinationContextFormValues,
  MedicalHistoryFormValues,
} from '@/features/investigation/schemas';
import { useNotificationByCase } from '@/features/notification/api';
import type { PregnancyGateState } from '@/features/notification/schemas';
import { patientResource } from '@/features/patient/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { usePregnancyGate } from '@/shared/hooks/usePregnancyGate';
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

type InvestigationSectionId =
  | 'source'
  | 'basicInfo'
  | 'team'
  | 'medicalHistory'
  | 'pregnancy'
  | 'clinicalEvaluation'
  | 'evaluationInstitutions'
  | 'diagnostics'
  // Sección D (SPEC FE13d §4 paso 10): `vaccinesAdministered` es una lista satélite sin botón
  // propio, igual que `team` y `evaluationInstitutions` — se pasa de largo sola. `vaccinationContext`
  // cubre D.3–D.6 y D1 en un solo «Guardar y continuar».
  | 'vaccinesAdministered'
  | 'vaccinationContext'
  // E1/E2 (§6 decision 7 de FE13d): dos identificadores sobre la misma fila. `coldChainStorage`
  // sólo gobierna si `<ColdChainSection>` se monta — el «Continuar» entre E1 y E2 vive dentro del
  // propio componente y llama a `advance()` de este mismo `useProgressiveSections`, nunca a un
  // botón pintado aquí. `coldChainTransport` es el último identificador con guardado real.
  | 'coldChainStorage'
  | 'coldChainTransport';
const BASE_SECTIONS: InvestigationSectionId[] = ['source', 'basicInfo', 'team', 'medicalHistory'];

// The combined draft (§3.4): a single `'investigation'` key, even though four self-contained
// sections write into it — every field is optional because the user may have touched only one
// section before the accidental tab close.
interface InvestigationDraftValues {
  source?: InvestigationSourceFormValues;
  basicInfo?: InvestigationFormValues;
  autopsy?: InvestigationAutopsyFormValues;
  medicalHistory?: MedicalHistoryFormValues;
  // Independent from `medicalHistory` above even though both are `MedicalHistoryFormValues` over
  // the same row (§4 paso 6): two separate `useForm` instances, two separate draft slots.
  pregnancy?: MedicalHistoryFormValues;
  // Section C (SPEC FE13c §4 paso 8) — `evaluationInstitutions` and `diagnostics` are satellite
  // lists that persist on every add/edit, the same reason `team` never gets a draft slot.
  clinicalEvaluation?: InvestigationClinicalEvaluationFormValues;
  // Section D/D1 and E1/E2 (SPEC FE13d §4 paso 10) — `vaccinesAdministered` gets no slot, same
  // reason as `team` and `evaluationInstitutions` above.
  vaccinationContext?: InvestigationVaccinationContextFormValues;
  coldChain?: InvestigationColdChainFormValues;
}

interface InvestigationStepBodyProps {
  caseId: string;
  investigationId: string;
  investigation: InvestigationDetail;
  investigationSource: InvestigationSourceDetail | null;
  investigationAutopsy: InvestigationAutopsyDetail | null;
  medicalHistory: InvestigationMedicalHistoryDetail | null;
  clinicalEvaluation: InvestigationClinicalEvaluationDetail | null;
  vaccinationContext: InvestigationVaccinationContextDetail | null;
  coldChain: InvestigationColdChainDetail | null;
  notification: NotificationDetail | null;
  // Resolved once by `InvestigationStep`, already `!== undefined` by the time the body mounts
  // (§4 paso 6, criterio de `readyToRenderForm` en `NotificationStep`): B1 either doesn't exist
  // at all (`'hidden'`) or exists with or without the "Si aplica" mark.
  pregnancyGate: PregnancyGateState;
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
  medicalHistory,
  clinicalEvaluation,
  vaccinationContext,
  coldChain,
  notification,
  pregnancyGate,
  existedOnMount,
  isClosed,
}: InvestigationStepBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

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

  // `pregnancy` is simply absent from the list when the gate is closed, not merely hidden by CSS
  // (SPEC FE13b §4 paso 6) — a male patient's stepper has one fewer section. Section C's three
  // identifiers (SPEC FE13c §4 paso 8) always follow, gate open or closed: `clinicalEvaluation`
  // gets its own "Guardar y continuar" like every other form section, `evaluationInstitutions`
  // gets a plain "Siguiente" — a list has nothing to save of its own, but §6 decision 5 rejected
  // folding it into C's form because that would leave altas under a form that isn't saved yet —
  // and `evaluationInstitutions` is `lastWithButton`: `diagnostics` reveals with that last advance,
  // with no button of its own (§2, "los diagnósticos se revelan con el último avance").
  const sections: InvestigationSectionId[] = [
    ...BASE_SECTIONS,
    ...(pregnancyGate === 'hidden' ? [] : (['pregnancy'] as const)),
    'clinicalEvaluation',
    'evaluationInstitutions',
    'diagnostics',
    // Sección D → D1 → E1 → E2 (SPEC FE13d §2, §4 paso 10): en el orden del formulario, detrás
    // de las tres secciones de FE13c.
    'vaccinesAdministered',
    'vaccinationContext',
    'coldChainStorage',
    'coldChainTransport',
  ];
  const lastWithButton: InvestigationSectionId = 'coldChainTransport';

  const revealAllRef = useRef(existedOnMount || isClosed);
  const { isVisible, frontier, advance } = useProgressiveSections<InvestigationSectionId>({
    sections,
    revealAll: revealAllRef.current,
    lastWithButton,
  });

  // The three satellite lists with no button of their own — `team`, `diagnostics` (SPEC FE13c
  // §4 paso 8, it "reveals with the last advance") and `vaccinesAdministered` (SPEC FE13d §4
  // paso 10, same reasoning) — are passed through automatically, which is what lets the next
  // gated section become the frontier instead of getting stuck behind one with no button to press.
  useEffect(() => {
    if (frontier === 'team' || frontier === 'diagnostics' || frontier === 'vaccinesAdministered') {
      advance();
    }
  }, [frontier, advance]);

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

      {isVisible('medicalHistory') && (
        <MedicalHistorySection
          caseId={caseId}
          investigationId={investigationId}
          medicalHistory={medicalHistory}
          disabled={isClosed}
          showSaveButton={frontier === 'medicalHistory'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.medicalHistory}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, medicalHistory: values }))
          }
        />
      )}

      {isVisible('pregnancy') && (
        <PregnancySection
          investigationId={investigationId}
          medicalHistory={medicalHistory}
          pregnancyGate={pregnancyGate}
          disabled={isClosed}
          showSaveButton={frontier === 'pregnancy'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.pregnancy}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, pregnancy: values }))
          }
        />
      )}

      {isVisible('clinicalEvaluation') && (
        <ClinicalEvaluationSection
          caseId={caseId}
          investigationId={investigationId}
          clinicalEvaluation={clinicalEvaluation}
          disabled={isClosed}
          showSaveButton={frontier === 'clinicalEvaluation'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.clinicalEvaluation}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, clinicalEvaluation: values }))
          }
        />
      )}

      {isVisible('evaluationInstitutions') && (
        <div className="flex flex-col gap-3">
          <EvaluationInstitutionList investigationId={investigationId} disabled={isClosed} />
          {frontier === 'evaluationInstitutions' && (
            <Button type="button" className="min-h-11 w-full md:w-auto md:self-end" onClick={advance}>
              {t('caseWizard.actions.next')}
            </Button>
          )}
        </div>
      )}

      {isVisible('diagnostics') && (
        <DiagnosticList
          caseId={caseId}
          investigationId={investigationId}
          disabled={isClosed}
          // Defensive per SPEC FE13c §3.6/§4 paso 7: this step already guarantees the investigation
          // header exists before this section can ever mount, so the retry just re-reads — there is
          // nothing new to create.
          onMissingInvestigation={() =>
            void queryClient.invalidateQueries({ queryKey: investigationDiagnosticsByCaseKey(caseId) })
          }
        />
      )}

      {isVisible('vaccinesAdministered') && (
        <VaccineAdministeredList investigationId={investigationId} disabled={isClosed} />
      )}

      {isVisible('vaccinationContext') && (
        <VaccinationContextSection
          caseId={caseId}
          investigationId={investigationId}
          vaccinationContext={vaccinationContext}
          disabled={isClosed}
          showSaveButton={frontier === 'vaccinationContext'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.vaccinationContext}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, vaccinationContext: values }))
          }
        />
      )}

      {isVisible('coldChainStorage') && (
        <ColdChainSection
          caseId={caseId}
          investigationId={investigationId}
          coldChain={coldChain}
          disabled={isClosed}
          transportRevealed={isVisible('coldChainTransport')}
          onRevealTransport={advance}
          showSaveButton={frontier === 'coldChainTransport'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.coldChain}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, coldChain: values }))
          }
        />
      )}
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
  const medicalHistory = useInvestigationMedicalHistoryByCase(caseId, stageExists);
  const clinicalEvaluation = useInvestigationClinicalEvaluationByCase(caseId, stageExists);
  const vaccinationContext = useInvestigationVaccinationContextByCase(caseId, stageExists);
  const coldChain = useInvestigationColdChainByCase(caseId, stageExists);
  const notificationStageExists = workflow.data?.stages.notification.exists === true;
  const notification = useNotificationByCase(caseId, notificationStageExists);
  const create = investigationResource.useCreate();

  // The gate of §7.4 (SPEC FE13b §4 paso 6, same hook FE12d already shares with the notification
  // step): reads three queries this step hasn't fetched before, so the section is gated on their
  // own readiness the same way `NotificationStep` waits for `patient` before trusting it — the
  // hook itself has no "loading" state, and trusting a transient `visibleIfApplicable` before
  // `patient`/`classification` resolve would flash B1 open for a patient the data will turn out
  // to be male.
  const classificationStageExists = workflow.data?.stages.classification.exists === true;
  const classification = useClassificationByCase(caseId, classificationStageExists);
  const esaviCase = esaviCaseResource.useOne(caseId);
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');
  const pregnancyGate = usePregnancyGate(caseId);
  const pregnancyGateReady =
    !!esaviCase.data &&
    (!!patient.data || patient.isError) &&
    (!classificationStageExists || !!classification.data);

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
    investigationAutopsy.isLoading ||
    medicalHistory.isLoading ||
    clinicalEvaluation.isLoading ||
    vaccinationContext.isLoading ||
    coldChain.isLoading ||
    !pregnancyGateReady
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
      medicalHistory={medicalHistory.data ?? null}
      clinicalEvaluation={clinicalEvaluation.data ?? null}
      vaccinationContext={vaccinationContext.data ?? null}
      coldChain={coldChain.data ?? null}
      notification={notification.data ?? null}
      pregnancyGate={pregnancyGate}
      existedOnMount={existedOnMountRef.current ?? false}
      isClosed={workflow.data.status.code === 'CLOSED'}
    />
  );
}
