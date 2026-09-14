import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import type { AnswerOption } from '@/contracts/common';
import { esaviCaseResource } from '@/features/esaviCase/api';
import {
  investigationMedicalHistoryResource,
  useInvestigationMedicalHistoryByCase,
  useNewbornConditionsByMedicalHistory,
} from '@/features/investigation/api';
import {
  notificationPregnancyResource,
  useNotificationByCase,
  useNotificationPregnancyByNotification,
  useNotificationPregnancyComplicationsByPregnancy,
} from '@/features/notification/api';
import { resolvePregnancyGate } from '@/features/notification/schemas';
import { patientResource } from '@/features/patient/api';
import { ageInYearsForPregnancyGate } from '@/shared/helpers/age';
import { PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE } from '@/shared/hooks/usePregnancyGate';
import { useSystemConfigByCode } from '@/shared/hooks/useSystemConfigByCode';

// A candidate sex, birth date or event date — whatever `PatientStep`/`CaseOpeningStep` is about
// to save, before it is ever sent. Omitting a field means "use what's on file", not "clear it":
// each of the two callers only ever changes one side of the pair (`PatientStep` never touches
// `eventDate`, `CaseOpeningStep` never touches `sexItemId`/`birthDate`).
export interface PregnancyGateCandidate {
  sex?: { catalogItemId: string; value: string | null } | null;
  birthDate?: string | null;
  eventDate?: string | null;
}

// CASE-PROCESS.md §7.4, revisado por SPEC FE12d §4 paso 13 y ampliado por SPEC FE13b §4 paso 3:
// "mientras haya datos de embarazo, el cambio no se puede guardar" — y ahora hay dos tablas donde
// esos datos pueden vivir, `notificationPregnancy` (paso 4) e `investigationMedicalHistory` (paso
// 5). `PatientStep` (sexItemId, birthDate) y `CaseOpeningStep` (eventDate) son los dos únicos
// pasos que pueden cerrar la compuerta desde fuera, así que el guard vive en `shared/hooks/`, no
// en ninguno de los dos features que lo consumen (CONVENTIONS.md §10.4).
export function usePregnancyBlockGuard(caseId: string | undefined) {
  // `caseId` viaja tal cual, no `?? ''` (a diferencia de `esaviCaseResource.useOne` abajo):
  // `useCaseWorkflow` sólo se autogobierna con `caseId !== undefined`, así que un `''` lo
  // dispararía igual — justo lo que rompería `PatientFormDialog` cuando se usa sin caso, fuera del
  // wizard.
  const workflow = useCaseWorkflow(caseId);
  const notificationStageExists = workflow.data?.stages.notification.exists === true;
  const notification = useNotificationByCase(caseId, notificationStageExists);
  const notificationId = notification.data?.notificationId ?? null;
  const pregnancy = useNotificationPregnancyByNotification(notificationId ?? undefined, notificationId !== null);
  const pregnancyId = pregnancy.data?.pregnancyId ?? null;
  const complications = useNotificationPregnancyComplicationsByPregnancy(
    pregnancyId ?? undefined,
    pregnancyId !== null,
  );

  // El bloque del paso 5, leído con la misma forma que el de notificación de arriba, gateado por
  // `stages.investigation.exists`: un caso sin investigación todavía nunca pide una ficha de
  // antecedentes que no puede existir (SPEC FE13b §4 paso 3).
  const investigationStageExists = workflow.data?.stages.investigation.exists === true;
  const medicalHistory = useInvestigationMedicalHistoryByCase(caseId, investigationStageExists);
  const investigationId = medicalHistory.data?.investigationId ?? null;
  const newbornConditions = useNewbornConditionsByMedicalHistory(
    investigationId ?? undefined,
    investigationId !== null,
  );

  const esaviCase = esaviCaseResource.useOne(caseId ?? '');
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');
  const femaleSexConfig = useSystemConfigByCode(PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE);

  const clearNotification = notificationPregnancyResource.useUpdate();
  const clearInvestigation = investigationMedicalHistoryResource.useUpdate();

  const activeComplicationsCount = complications.data?.rows.length ?? 0;
  // «Mientras haya datos» (§7.4) es por columna, no por fila: `pregnancyId` sobrevive a un
  // «Vaciar» — el `004` de limpieza no lo borra (§2, §3.2) — así que si el bloqueo mirara sólo si
  // la fila existe, «Vaciar» nunca desbloquearía nada y el guard se dispararía otra vez en el
  // siguiente «Guardar». Vacía es "sin datos", con fila o sin ella.
  const hasNotificationPregnancyData =
    pregnancyId !== null &&
    (pregnancy.data?.wasPregnantAtVaccination != null ||
      pregnancy.data?.wasPregnantAtEsavi != null ||
      pregnancy.data?.lastMenstruationDate != null ||
      pregnancy.data?.probableDeliveryDate != null ||
      pregnancy.data?.hasComplications != null ||
      pregnancy.data?.notes != null ||
      activeComplicationsCount > 0);

  const activeConditionsCount = newbornConditions.data?.rows.length ?? 0;
  // Las diez columnas de la compuerta interior de §7.4 en el paso 5 (SPEC FE13b §4 paso 3):
  // `isPregnancyConfirmed` y las nueve que gobierna. Las afecciones del recién nacido NO entran
  // aquí — cuelgan de `pregnancyOutcome`, no del sexo ni de la edad del paciente — así que
  // «Vaciar» este bloque nunca espera a que se retiren, a diferencia del de notificación con sus
  // complicaciones (SPEC FE13b §2, §6).
  const hasInvestigationPregnancyData =
    medicalHistory.data != null &&
    (medicalHistory.data.isPregnancyConfirmed != null ||
      medicalHistory.data.gestationalWeeks != null ||
      medicalHistory.data.gestationMethodItemId != null ||
      medicalHistory.data.deliveryItemId != null ||
      medicalHistory.data.birthItemId != null ||
      medicalHistory.data.pregnancyOutcomeItemId != null ||
      medicalHistory.data.hasPregnancyRiskFactor != null ||
      medicalHistory.data.riskFactorDescription != null ||
      medicalHistory.data.birthWeightGrams != null ||
      medicalHistory.data.wasBreastfed != null);

  const hasPregnancyData = hasNotificationPregnancyData || hasInvestigationPregnancyData;

  function wouldCloseGate(candidate: PregnancyGateCandidate): boolean {
    const sex = candidate.sex !== undefined ? candidate.sex : (patient.data?.sex ?? null);
    const birthDate = candidate.birthDate !== undefined ? candidate.birthDate : (patient.data?.birthDate ?? null);
    const eventDate = candidate.eventDate !== undefined ? candidate.eventDate : (esaviCase.data?.eventDate ?? null);

    const isMale = sex?.value === 'MALE';
    const isFemaleConfirmed = femaleSexConfig.data
      ? sex?.catalogItemId === String(femaleSexConfig.data.value)
      : sex?.value === 'FEMALE';
    const age = ageInYearsForPregnancyGate(birthDate, eventDate);

    return resolvePregnancyGate(isMale, isFemaleConfirmed, age) === 'hidden';
  }

  // Vaciar, no retirar (§7.4, §8): un solo `PUT` que conserva `pregnancyId`, la auditoría y la
  // posibilidad de volver — `NOTIFPRG-005A` no se llama nunca (§2, §3.2).
  function clearNotificationBlock(onSuccess: () => void) {
    if (!pregnancyId) return;
    clearNotification.mutate(
      {
        id: pregnancyId,
        data: {
          // El contrato declara `wasPregnantAtVaccination` sin `| null` (obligatoria en el `001`),
          // pero el `004` sí la acepta vacía (SPEC FE12d §3.3, §4 paso 8, mismo cast que
          // `buildPregnancyPayload` de `NotificationStep.tsx`) — «vaciar» tiene que vaciar las seis
          // columnas, no cinco.
          wasPregnantAtVaccination: null as unknown as AnswerOption | undefined,
          wasPregnantAtEsavi: null,
          lastMenstruationDate: null,
          probableDeliveryDate: null,
          hasComplications: null,
          notes: null,
        },
      },
      { onSuccess },
    );
  }

  // Vaciar el bloque del paso 5: un solo `PUT` con los diez `null` explícitos (SPEC FE13b §3.5
  // punto 3, §8) — nunca toca `notificationPregnancy` ni las afecciones del recién nacido, que
  // siguen sin poder retirarse mientras dure la deuda de §10 de CASE-PROCESS.md.
  function clearInvestigationBlock(onSuccess: () => void) {
    if (!investigationId) return;
    clearInvestigation.mutate(
      {
        id: investigationId,
        data: {
          isPregnancyConfirmed: null,
          gestationalWeeks: null,
          gestationMethodItemId: null,
          deliveryItemId: null,
          birthItemId: null,
          pregnancyOutcomeItemId: null,
          hasPregnancyRiskFactor: null,
          riskFactorDescription: null,
          birthWeightGrams: null,
          wasBreastfed: null,
        },
      },
      { onSuccess },
    );
  }

  // Sin esto, un «Guardar» pulsado antes de que las nueve lecturas del guard resuelvan encontraría
  // `hasPregnancyData` en `false` por falta de datos, no porque no los haya — dejaría pasar
  // exactamente la escritura que este guard existe para impedir. Cada `.isLoading` ya vale `false`
  // en la consulta que su propio `enabled` mantiene apagada (v5: `isPending && isFetching`), así
  // que esto no bloquea nada fuera de un caso (`caseId` ausente).
  const isReady =
    !workflow.isLoading &&
    !notification.isLoading &&
    !pregnancy.isLoading &&
    !complications.isLoading &&
    !medicalHistory.isLoading &&
    !newbornConditions.isLoading &&
    !esaviCase.isLoading &&
    !patient.isLoading &&
    !femaleSexConfig.isLoading;

  return {
    hasPregnancyData,
    wouldCloseGate,
    isReady,
    // Los dos bloques se exponen por separado, cada uno con su propio conteo, su propia escritura
    // y su propio estado de mutación — es lo que le permite al diálogo enumerarlos uno por uno en
    // vez de encadenar dos escrituras detrás de un solo «Vaciar» (SPEC FE13b §4 paso 3, §6).
    notificationBlock: {
      hasData: hasNotificationPregnancyData,
      activeComplicationsCount,
      clear: clearNotificationBlock,
      isClearing: clearNotification.isPending,
      clearError: clearNotification.error,
    },
    investigationBlock: {
      hasData: hasInvestigationPregnancyData,
      activeConditionsCount,
      clear: clearInvestigationBlock,
      isClearing: clearInvestigation.isPending,
      clearError: clearInvestigation.error,
    },
  };
}
