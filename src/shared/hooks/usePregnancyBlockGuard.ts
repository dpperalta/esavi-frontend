import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import type { AnswerOption } from '@/contracts/common';
import { esaviCaseResource } from '@/features/esaviCase/api';
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

// CASE-PROCESS.md §7.4, revisado por SPEC FE12d §4 paso 13: "mientras haya datos de embarazo, el
// cambio no se puede guardar". `PatientStep` (sexItemId, birthDate) y `CaseOpeningStep`
// (eventDate) son los dos únicos pasos que pueden cerrar la compuerta desde fuera, así que el
// guard vive en `shared/hooks/`, no en ninguno de los dos features (CONVENTIONS.md §10.4).
export function usePregnancyBlockGuard(caseId: string | undefined) {
  // `caseId` viaja tal cual, no `?? ''` (a diferencia de `esaviCaseResource.useOne` abajo):
  // `useCaseWorkflow` sólo se autogobierna con `caseId !== undefined`, así que un `''` lo
  // dispararía igual — justo lo que rompería `PatientFormDialog` cuando se usa sin caso, fuera del
  // wizard.
  const workflow = useCaseWorkflow(caseId);
  const stageExists = workflow.data?.stages.notification.exists === true;
  const notification = useNotificationByCase(caseId, stageExists);
  const notificationId = notification.data?.notificationId ?? null;
  const pregnancy = useNotificationPregnancyByNotification(notificationId ?? undefined, notificationId !== null);
  const pregnancyId = pregnancy.data?.pregnancyId ?? null;
  const complications = useNotificationPregnancyComplicationsByPregnancy(
    pregnancyId ?? undefined,
    pregnancyId !== null,
  );

  const esaviCase = esaviCaseResource.useOne(caseId ?? '');
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');
  const femaleSexConfig = useSystemConfigByCode(PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE);

  const clear = notificationPregnancyResource.useUpdate();

  const activeComplicationsCount = complications.data?.rows.length ?? 0;
  // «Mientras haya datos» (§7.4) es por columna, no por fila: `pregnancyId` sobrevive a un
  // «Vaciar» — el `004` de limpieza no lo borra (§2, §3.2) — así que si el bloqueo mirara sólo si
  // la fila existe, «Vaciar» nunca desbloquearía nada y el guard se dispararía otra vez en el
  // siguiente «Guardar». Vacía es "sin datos", con fila o sin ella.
  const hasPregnancyData =
    pregnancyId !== null &&
    (pregnancy.data?.wasPregnantAtVaccination != null ||
      pregnancy.data?.wasPregnantAtEsavi != null ||
      pregnancy.data?.lastMenstruationDate != null ||
      pregnancy.data?.probableDeliveryDate != null ||
      pregnancy.data?.hasComplications != null ||
      pregnancy.data?.notes != null ||
      activeComplicationsCount > 0);

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
  function clearBlock(onSuccess: () => void) {
    if (!pregnancyId) return;
    clear.mutate(
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

  // Sin esto, un «Guardar» pulsado antes de que las siete lecturas del guard resuelvan encontraría
  // `hasPregnancyData` en `false` por falta de datos, no porque no los haya — dejaría pasar
  // exactamente la escritura que este guard existe para impedir. Cada `.isLoading` ya vale `false`
  // en la consulta que su propio `enabled` mantiene apagada (v5: `isPending && isFetching`), así
  // que esto no bloquea nada fuera de un caso (`caseId` ausente).
  const isReady =
    !workflow.isLoading &&
    !notification.isLoading &&
    !pregnancy.isLoading &&
    !complications.isLoading &&
    !esaviCase.isLoading &&
    !patient.isLoading &&
    !femaleSexConfig.isLoading;

  return {
    hasPregnancyData,
    activeComplicationsCount,
    wouldCloseGate,
    clearBlock,
    isClearing: clear.isPending,
    clearError: clear.error,
    isReady,
  };
}
