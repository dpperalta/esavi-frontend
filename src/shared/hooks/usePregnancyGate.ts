import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useClassificationByCase } from '@/features/classification/api';
import { esaviCaseResource } from '@/features/esaviCase/api';
import { resolvePregnancyGate, type PregnancyGateState } from '@/features/notification/schemas';
import { patientResource } from '@/features/patient/api';
import { useSystemConfigByCode } from '@/shared/hooks/useSystemConfigByCode';

// Exportada para que `NotificationStep`/`PregnancySection` (SPEC FE12d §4 paso 7) puedan pedir la
// misma fila y decidir el estado «deshabilitado por configuración» (§3.6) sin duplicar el string
// ni la petición — TanStack Query comparte la caché por `queryKey`.
export const PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE = 'PREGNANCY_FEMALE_SEX_ITEM';

// CASE-PROCESS.md §7.4, la compuerta de embarazo — extraída de la implementación en línea que
// FE12a dejó en `NotificationStep` (SPEC FE12d §4 paso 6, §8: "se sustituye por
// `usePregnancyGate(caseId)`"). La usan tres bloques en dos pasos —la rama grave (FE12a), el
// bloque de embarazo de este spec y el del paso 5 de FE13— y CONVENTIONS.md §10.4 prohíbe
// escribirla dos veces.
//
// ESAVI-SYSCONF-006 (vía `useSystemConfigByCode`) — el sexo se compara contra el `catalogItemId`
// de la fila de configuración, lo que compara `ESAVI-NOTIFPRG-001`, y sólo cae a
// `value === 'FEMALE'` cuando la fila no está sembrada (SPEC FE12d §3.5, §10.6). Esa caída de
// respaldo cierra la discrepancia de §7.2: un despliegue cuya fila apunte a un ítem distinto del
// que lleva `value === 'FEMALE'` deja de mostrar «Visible, normal» sobre un bloque que el `001`
// rechazaría — cae a «Si aplica» en su lugar. La detección de `MALE` sigue por `value` en los dos
// casos, porque no hay un ítem de configuración equivalente para el sexo masculino.
export function usePregnancyGate(caseId: string): PregnancyGateState {
  const workflow = useCaseWorkflow(caseId);
  const classificationStageExists = workflow.data?.stages.classification.exists === true;
  const classification = useClassificationByCase(caseId, classificationStageExists);
  const esaviCase = esaviCaseResource.useOne(caseId);
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');
  const femaleSexConfig = useSystemConfigByCode(PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE);

  const sex = patient.data?.sex ?? null;
  const isMale = sex?.value === 'MALE';
  const isFemaleConfirmed = femaleSexConfig.data
    ? sex?.catalogItemId === String(femaleSexConfig.data.value)
    : sex?.value === 'FEMALE';

  return resolvePregnancyGate(isMale, isFemaleConfirmed, classification.data?.age ?? null);
}
