import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationAdministrationErrorDetail } from '@/contracts/declared/investigationAdministrationError';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationClinicalEvaluationDetail } from '@/contracts/declared/investigationClinicalEvaluation';
import type { InvestigationColdChainDetail } from '@/contracts/declared/investigationColdChain';
import type { InvestigationCommunityDetail } from '@/contracts/declared/investigationCommunity';
import type { InvestigationMedicalHistoryDetail } from '@/contracts/declared/investigationMedicalHistory';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { InvestigationVaccinationContextDetail } from '@/contracts/declared/investigationVaccinationContext';
import type { NotificationDetail } from '@/contracts/declared/notification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useClassificationByCase } from '@/features/classification/api';
import { esaviCaseResource } from '@/features/esaviCase/api';
import { useCaseWizard } from '@/features/esaviCase/CaseWizardContext';
import { AdministrationErrorSection } from '@/features/investigation/AdministrationErrorSection';
import { BasicInfoSection } from '@/features/investigation/BasicInfoSection';
import { ClinicalEvaluationSection } from '@/features/investigation/ClinicalEvaluationSection';
import { ColdChainSection } from '@/features/investigation/ColdChainSection';
import { CommunitySection } from '@/features/investigation/CommunitySection';
import { DiagnosticList } from '@/features/investigation/DiagnosticList';
import { EvaluationInstitutionList } from '@/features/investigation/EvaluationInstitutionList';
import { MedicalHistorySection } from '@/features/investigation/MedicalHistorySection';
import { OtherFindingsSection } from '@/features/investigation/OtherFindingsSection';
import { PregnancySection } from '@/features/investigation/PregnancySection';
import { SourceSection } from '@/features/investigation/SourceSection';
import { TeamMemberList } from '@/features/investigation/TeamMemberList';
import { VaccinationContextSection } from '@/features/investigation/VaccinationContextSection';
import { VaccineAdministeredList } from '@/features/investigation/VaccineAdministeredList';
import {
  investigationByCaseKey,
  investigationDiagnosticsByCaseKey,
  investigationResource,
  investigationVaccineAdministeredResource,
  useEvaluationInstitutionsByInvestigation,
  useInvestigationAdministrationErrorByCase,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationClinicalEvaluationByCase,
  useInvestigationColdChainByCase,
  useInvestigationCommunityByCase,
  useInvestigationDiagnosticsByCase,
  useInvestigationMedicalHistoryByCase,
  useInvestigationSourceByCase,
  useInvestigationVaccinationContextByCase,
  investigationTeamMemberResource,
} from '@/features/investigation/api';
import type {
  InvestigationAdministrationErrorFormValues,
  InvestigationAutopsyFormValues,
  InvestigationClinicalEvaluationFormValues,
  InvestigationColdChainFormValues,
  InvestigationCommunityFormValues,
  InvestigationFormValues,
  InvestigationSectionHandle,
  InvestigationSourceFormValues,
  InvestigationVaccinationContextFormValues,
  MedicalHistoryFormValues,
  OtherFindingsFormValues,
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

// The empty-sections warning of SPEC FE13e §3.6: computed on what the server already answered,
// never on any `useForm`'s live state — a section counts as empty when every one of its data
// columns reads `null`, and a satellite list counts as empty with zero active rows. Grouped by
// form section, not by the seventeen progressive-reveal identifiers: E1/E2 share one row (and one
// warning entry) and so do F/F2, exactly as the spec's own example lists "Cadena de frío" once.
function isSourceEmpty(source: InvestigationSourceDetail | null): boolean {
  if (!source) return true;
  return (
    source.history === null &&
    source.interviewVaccinatedPerson === null &&
    source.interviewHealthWorker === null &&
    source.vaccinationRecord === null &&
    source.autopsyRecord === null &&
    source.verbalAutopsyRecord === null &&
    source.investigationReport === null &&
    source.other === null &&
    source.otherDescription === null &&
    source.notes === null
  );
}

function isBasicInfoEmpty(investigation: InvestigationDetail): boolean {
  return (
    investigation.status === null &&
    investigation.vaccinationSite === null &&
    investigation.vaccinationHealthFacility === null &&
    investigation.vaccinationGeoLocation === null &&
    investigation.hospitalizationDate === null &&
    investigation.investigationStartDate === null &&
    investigation.vaccinationLatitude === null &&
    investigation.vaccinationLongitude === null
  );
}

function isMedicalHistoryEmpty(history: InvestigationMedicalHistoryDetail | null): boolean {
  if (!history) return true;
  return (
    history.hasPriorHospitalizationHistory === null &&
    history.priorHospitalizationObservations === null &&
    history.hasFamilyHistory === null &&
    history.familyHistoryObservations === null &&
    history.isPregnancyConfirmed === null &&
    history.notes === null
  );
}

function isPregnancyEmpty(history: InvestigationMedicalHistoryDetail | null): boolean {
  if (!history) return true;
  return (
    history.gestationalWeeks === null &&
    history.gestationMethodItemId === null &&
    history.hasPregnancyRiskFactor === null &&
    history.riskFactorDescription === null &&
    history.deliveryItemId === null &&
    history.birthItemId === null &&
    history.birthWeightGrams === null &&
    history.pregnancyOutcomeItemId === null &&
    history.wasBreastfed === null
  );
}

function isClinicalEvaluationEmpty(evaluation: InvestigationClinicalEvaluationDetail | null): boolean {
  if (!evaluation) return true;
  return (
    evaluation.receivedMedicalAttention === null &&
    evaluation.sourceExam === null &&
    evaluation.sourceDocuments === null &&
    evaluation.sourceVerbalAutopsy === null &&
    evaluation.sourceOther === null &&
    evaluation.otherDescription === null &&
    evaluation.suspectedChildAbuse === null &&
    evaluation.childAbuseExplanation === null &&
    evaluation.suspectedDomesticViolence === null &&
    evaluation.domesticViolenceExplanation === null &&
    evaluation.clinicalDetailsPersonName === null &&
    evaluation.familyClinicalDetails === null &&
    evaluation.completeClinicalSummary === null &&
    evaluation.signsAndSymptoms === null &&
    evaluation.otherSocialBackground === null &&
    evaluation.notes === null
  );
}

function isVaccinationContextEmpty(context: InvestigationVaccinationContextDetail | null): boolean {
  if (!context) return true;
  return (
    context.momentItemId === null &&
    context.multidoseItemId === null &&
    context.vaccinatedPerVialCount === null &&
    context.vaccinatedPerBatchCount === null &&
    context.locations === null &&
    context.isCluster === null &&
    context.clusterIdentificationNumber === null &&
    context.clusterAdditionalCaseCount === null &&
    context.clusterUsedSameVial === null &&
    context.clusterSameVialCount === null &&
    context.notes === null
  );
}

function isColdChainEmpty(coldChain: InvestigationColdChainDetail | null): boolean {
  if (!coldChain) return true;
  return (
    coldChain.storageTemperatureMonitored === null &&
    coldChain.storageRangeDeviation === null &&
    coldChain.storageProcedureFollowed === null &&
    coldChain.storageOtherObjectPresent === null &&
    coldChain.storagePartiallyReconstitutedVaccine === null &&
    coldChain.storageVaccineNotUsable === null &&
    coldChain.storageDiluentNotUsable === null &&
    coldChain.storageKeyFindings === null &&
    coldChain.transportUsedThermos === null &&
    coldChain.transportSetInThermos === null &&
    coldChain.transportReturnedInThermos === null &&
    coldChain.transportUsedColdPack === null &&
    coldChain.transportTypeThermo === null &&
    coldChain.transportKeyFindings === null &&
    coldChain.notes === null
  );
}

function isAdministrationErrorEmpty(error: InvestigationAdministrationErrorDetail | null): boolean {
  if (!error) return true;
  return (
    error.usedAutoDisableSyringes === null &&
    error.usedGlassSyringes === null &&
    error.usedDisposableSyringes === null &&
    error.usedRecycledDisposableSyringes === null &&
    error.usedOtherSyringes === null &&
    error.otherSyringesDescription === null &&
    error.syringesKeyFindings === null &&
    error.reconstitutionUsedSameSyringe === null &&
    error.reconstitutionUsedSameSyringeDifferentVaccine === null &&
    error.reconstitutionUsedDifferentSyringeSameVial === null &&
    error.reconstitutionUsedDifferentSyringeDifferentVaccine === null &&
    error.reconstitutionFollowedManufacturerRecommendation === null &&
    error.reconstitutionKeyFindings === null &&
    error.hadPrescriptionError === null &&
    error.prescriptionErrorNotes === null &&
    error.hadContaminatedVaccine === null &&
    error.contaminatedVaccineNotes === null &&
    error.hadAbnormalVaccineConditions === null &&
    error.abnormalConditionsNotes === null &&
    error.hadPreparationError === null &&
    error.preparationErrorNotes === null &&
    error.hadHandlingError === null &&
    error.handlingErrorNotes === null &&
    error.hadImproperAdministration === null &&
    error.improperAdministrationNotes === null &&
    error.notes === null
  );
}

function isCommunityEmpty(community: InvestigationCommunityDetail | null): boolean {
  if (!community) return true;
  return (
    community.patientLatitude === null &&
    community.patientLongitude === null &&
    community.hadSimilarEvent === null &&
    community.similarEventDescription === null &&
    community.similarEventCount === null &&
    community.affectedVaccinated === null &&
    community.affectedUnvaccinated === null &&
    community.affectedUnknown === null &&
    community.otherComments === null &&
    community.notes === null
  );
}

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
  | 'coldChainTransport'
  // F/F2 and G/H (SPEC FE13e §3.6): the paso 5 closes with four more identifiers, seventeen in
  // total. `administrationErrorSyringes`/`administrationErrorPractices` mirror E1/E2's own-button
  // pattern — F's "Guardar y continuar" reveals F2 via `onRevealPractices`, never a button painted
  // here. `otherFindings` (H) is `lastWithButton`: it keeps its own "Guardar y continuar" (§3.5 E)
  // even though nothing is revealed behind it — the same harmless `advance()` past the end that
  // `coldChainTransport` already does.
  | 'administrationErrorSyringes'
  | 'administrationErrorPractices'
  | 'community'
  | 'otherFindings';
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
  // F/F2 and G/H (SPEC FE13e §4 paso 9) — `administrationError` covers both revealed identifiers,
  // same reasoning as `coldChain` above: one row, one `useForm`, one draft slot. `otherFindings`
  // gets its own slot even though it's a single `notes` field — it's a separate `useForm` from
  // `basicInfo`'s (§8).
  administrationError?: InvestigationAdministrationErrorFormValues;
  community?: InvestigationCommunityFormValues;
  otherFindings?: OtherFindingsFormValues;
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
  administrationError: InvestigationAdministrationErrorDetail | null;
  community: InvestigationCommunityDetail | null;
  notification: NotificationDetail | null;
  // For `CommunitySection`'s marker preload only (SPEC FE13e §3.7) — read, never duplicated.
  patientId: string | undefined;
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
  administrationError,
  community,
  notification,
  patientId,
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
    // F → F2 → G → H (SPEC FE13e §3.6): the four identifiers this spec adds, always at the end —
    // §2 out of scope says the movement of `notes` from A1 to H is the only reorder, and this is
    // a pure append.
    'administrationErrorSyringes',
    'administrationErrorPractices',
    'community',
    'otherFindings',
  ];
  const lastWithButton: InvestigationSectionId = 'otherFindings';

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

  // The generic "Guardar" of `CaseWizardActionBar` never had a handle to save (SPEC FE13a's own
  // `registerStep` omission): each of the ~10 sections below reports its own save/isDirty through
  // `onRegisterHandle`, and this aggregates them so a section revisited after its own frontier
  // moved past it — its own "Guardar y continuar" only ever shows at the frontier — still has a way
  // to persist. `sectionHandleSettersRef` hands each section a stable setter, created once and
  // keyed by id, so one section re-registering never changes another's identity and cascades into
  // the render loop `ClassificationStep` already hit once (SPEC FE11 §9).
  const { registerStep, unregisterStep } = useCaseWizard();
  const [sectionHandles, setSectionHandles] = useState<
    Partial<Record<InvestigationSectionId, InvestigationSectionHandle | null>>
  >({});
  const sectionHandleSettersRef = useRef<
    Partial<Record<InvestigationSectionId, (handle: InvestigationSectionHandle | null) => void>>
  >({});
  function getSectionHandleSetter(id: InvestigationSectionId) {
    const existing = sectionHandleSettersRef.current[id];
    if (existing) return existing;
    const setter = (handle: InvestigationSectionHandle | null) =>
      setSectionHandles((current) => ({ ...current, [id]: handle }));
    sectionHandleSettersRef.current[id] = setter;
    return setter;
  }

  const dirtySectionHandles = Object.values(sectionHandles).filter(
    (handle): handle is InvestigationSectionHandle => !!handle?.isDirty,
  );
  const isAnySectionDirty = dirtySectionHandles.length > 0;
  const performSaveRef = useRef(() => Promise.all(dirtySectionHandles.map((handle) => handle.save())));
  performSaveRef.current = () => Promise.all(dirtySectionHandles.map((handle) => handle.save()));

  useEffect(() => {
    registerStep({
      save: async () => {
        await performSaveRef.current();
      },
      isDirty: isAnySectionDirty,
      getPendingFields: () => [],
    });
    return () => unregisterStep();
  }, [registerStep, unregisterStep, isAnySectionDirty]);

  // The empty-sections warning's four satellite-list reads (SPEC FE13e §3.6): identical query
  // keys/params to the ones `TeamMemberList`/`EvaluationInstitutionList`/`DiagnosticList`/
  // `VaccineAdministeredList` already run once their own section is visible, so this never doubles
  // a network request — by the time H is visible every earlier section already is too (progressive
  // reveal is monotonic), and TanStack Query serves the same cache entry.
  const teamMembers = investigationTeamMemberResource.useListByParent!(investigationId, {
    pageSize: 100,
  });
  const evaluationInstitutions = useEvaluationInstitutionsByInvestigation(investigationId, true);
  const diagnostics = useInvestigationDiagnosticsByCase(caseId, true);
  const vaccinesAdministered = investigationVaccineAdministeredResource.useListByParent!(
    investigationId,
    { pageSize: 100 },
  );

  // §3.6: "las listas satélite cuentan como vacías cuando no tienen filas activas" — computed on
  // what the server answered, never on any `useForm`'s live state (§3.4).
  const emptySectionLabelKeys = [
    isSourceEmpty(investigationSource) && 'investigation.source.title',
    isBasicInfoEmpty(investigation) && 'investigation.basicInfo.title',
    (teamMembers.data?.count ?? 0) === 0 && 'investigation.team.sectionTitle',
    isMedicalHistoryEmpty(medicalHistory) && 'investigation.medicalHistory.title',
    pregnancyGate !== 'hidden' && isPregnancyEmpty(medicalHistory) && 'investigation.pregnancy.title',
    isClinicalEvaluationEmpty(clinicalEvaluation) && 'investigation.clinicalEvaluation.title',
    (evaluationInstitutions.data?.count ?? 0) === 0 && 'investigation.evaluationInstitution.title',
    (diagnostics.data?.count ?? 0) === 0 && 'investigation.diagnostic.title',
    (vaccinesAdministered.data?.count ?? 0) === 0 && 'investigation.vaccinesAdministered.title',
    isVaccinationContextEmpty(vaccinationContext) && 'investigation.vaccinationContext.title',
    // Reuses E1's own heading (already "Cadena de frío", with no E2-specific counterpart) instead
    // of declaring a new combined key — same one row, same single warning entry (§3.6).
    isColdChainEmpty(coldChain) && 'investigation.coldChain.storage.title',
    isAdministrationErrorEmpty(administrationError) && 'investigation.administrationError.title',
    isCommunityEmpty(community) && 'investigation.community.title',
    investigation.notes === null && 'investigation.otherFindings.title',
  ].filter((key): key is string => key !== false);
  const emptySectionLabels = emptySectionLabelKeys.map((key) => t(key));

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
            if (frontier === 'source') advance();
          }}
          draftValues={restoredValues.source}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, source: values }))
          }
          onRegisterHandle={getSectionHandleSetter('source')}
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
            if (frontier === 'basicInfo') advance();
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
          onRegisterHandle={getSectionHandleSetter('basicInfo')}
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
            if (frontier === 'medicalHistory') advance();
          }}
          draftValues={restoredValues.medicalHistory}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, medicalHistory: values }))
          }
          onRegisterHandle={getSectionHandleSetter('medicalHistory')}
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
            if (frontier === 'pregnancy') advance();
          }}
          draftValues={restoredValues.pregnancy}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, pregnancy: values }))
          }
          onRegisterHandle={getSectionHandleSetter('pregnancy')}
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
            if (frontier === 'clinicalEvaluation') advance();
          }}
          draftValues={restoredValues.clinicalEvaluation}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, clinicalEvaluation: values }))
          }
          onRegisterHandle={getSectionHandleSetter('clinicalEvaluation')}
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
            if (frontier === 'vaccinationContext') advance();
          }}
          draftValues={restoredValues.vaccinationContext}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, vaccinationContext: values }))
          }
          onRegisterHandle={getSectionHandleSetter('vaccinationContext')}
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
            if (frontier === 'coldChainTransport') advance();
          }}
          draftValues={restoredValues.coldChain}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, coldChain: values }))
          }
          onRegisterHandle={getSectionHandleSetter('coldChainStorage')}
        />
      )}

      {isVisible('administrationErrorSyringes') && (
        <AdministrationErrorSection
          caseId={caseId}
          investigationId={investigationId}
          administrationError={administrationError}
          disabled={isClosed}
          practicesRevealed={isVisible('administrationErrorPractices')}
          onRevealPractices={advance}
          showSaveButton={frontier === 'administrationErrorPractices'}
          onSaved={() => {
            clearDraft();
            if (frontier === 'administrationErrorPractices') advance();
          }}
          draftValues={restoredValues.administrationError}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, administrationError: values }))
          }
          onRegisterHandle={getSectionHandleSetter('administrationErrorSyringes')}
        />
      )}

      {isVisible('community') && (
        <CommunitySection
          caseId={caseId}
          investigationId={investigationId}
          patientId={patientId}
          community={community}
          disabled={isClosed}
          showSaveButton={frontier === 'community'}
          onSaved={() => {
            clearDraft();
            if (frontier === 'community') advance();
          }}
          draftValues={restoredValues.community}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, community: values }))
          }
          onRegisterHandle={getSectionHandleSetter('community')}
        />
      )}

      {isVisible('otherFindings') && (
        <>
          <OtherFindingsSection
            investigationId={investigationId}
            investigation={investigation}
            disabled={isClosed}
            showSaveButton={frontier === 'otherFindings'}
            onSaved={() => {
              clearDraft();
              if (frontier === 'otherFindings') advance();
            }}
            draftValues={restoredValues.otherFindings}
            onValuesChange={(values) =>
              setPendingDraftValues((current) => ({ ...current, otherFindings: values }))
            }
            onRegisterHandle={getSectionHandleSetter('otherFindings')}
          />

          {/* The non-blocking warning of §3.6 — informational only, computed from server data.
            Never gates «Completar etapa»: that button stays the shared, generic one from
            `CaseWizardActionBar` (SPEC FE08), unmodified by this spec. */}
          {emptySectionLabels.length > 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('investigation.complete.emptySections', { sections: emptySectionLabels.join(', ') })}
            </p>
          )}
        </>
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
  const administrationError = useInvestigationAdministrationErrorByCase(caseId, stageExists);
  const community = useInvestigationCommunityByCase(caseId, stageExists);
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
    administrationError.isLoading ||
    community.isLoading ||
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
      administrationError={administrationError.data ?? null}
      community={community.data ?? null}
      notification={notification.data ?? null}
      patientId={patientId}
      pregnancyGate={pregnancyGate}
      existedOnMount={existedOnMountRef.current ?? false}
      isClosed={workflow.data.status.code === 'CLOSED'}
    />
  );
}
