import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AnswerOption } from '@/contracts/common';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationInput } from '@/contracts/notification';
import type { CreateNotificationPregnancyInput } from '@/contracts/notificationPregnancy';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';
import type { NonSevereNotificationDetail } from '@/contracts/declared/nonSevereNotification';
import type { NotificationDetail } from '@/contracts/declared/notification';
import type { SevereNotificationDetail } from '@/contracts/declared/severeNotification';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import type { NotificationPregnancyDetail } from '@/contracts/declared/notificationPregnancy';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useClassificationByCase } from '@/features/classification/api';
import { EventList } from '@/features/notification/EventList';
import { MedicalHistoryList } from '@/features/notification/MedicalHistoryList';
import { MedicationList } from '@/features/notification/MedicationList';
import { VaccineList } from '@/features/notification/VaccineList';
import {
  nonSevereNotificationByCaseKey,
  nonSevereNotificationResource,
  notificationByCaseKey,
  notificationPregnancyByNotificationKey,
  notificationPregnancyResource,
  notificationResource,
  severeNotificationByCaseKey,
  severeNotificationResource,
  useNonSevereNotificationByCase,
  useNotificationByCase,
  useNotificationEventsByCase,
  useNotificationMedicalHistoriesByCase,
  useNotificationMedicationsByCase,
  useNotificationPregnancyByNotification,
  useNotificationPregnancyComplicationsByPregnancy,
  useNotificationVaccinesByCase,
  useSevereNotificationByCase,
} from '@/features/notification/api';
import {
  createNotificationCompleteSchema,
  isDeathDateNotBeforeEventDate,
  NOTIFPRG_ALREADY_EXISTS,
  NOTIFPRG_PATIENT_NOT_FEMALE,
  NOTIFPRG_SEX_CONFIG_MISSING,
  nonSevereNotificationErrorFieldMap,
  notificationErrorFieldMap,
  notificationPregnancyErrorFieldMap,
  notificationSaveSchema,
  severeNotificationErrorFieldMap,
  type NotificationCompleteContext,
  type NotificationFormValues,
  type PregnancyGateState,
} from '@/features/notification/schemas';
import { patientResource } from '@/features/patient/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { Button } from '@/shared/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';
import { useProgressiveSections } from '@/shared/hooks/useProgressiveSections';
import {
  PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE,
  usePregnancyGate,
} from '@/shared/hooks/usePregnancyGate';
import { useSystemConfigByCode } from '@/shared/hooks/useSystemConfigByCode';
import { resolveDraftConflict, useDraftsStore } from '@/shared/stores/draftsStore';
import { esaviCaseResource } from './api';
import { useCaseWizard } from './CaseWizardContext';
import { PregnancySection } from './PregnancySection';
import { VaccinationBackgroundSection } from './VaccinationBackgroundSection';
import { VerificationSourceSection } from './VerificationSourceSection';

// The four severe-branch flags of section 1 (SPEC FE12e §3.1), inline since the block that held
// them was dissolved. They share shape and behaviour, so they render from a list.
const SEVERE_HISTORY_FLAGS = [
  { name: 'hasPreviousEventHistory', labelKey: 'notification.severe.hasPreviousEventHistory' },
  { name: 'hasAllergyToOtherVaccines', labelKey: 'notification.severe.hasAllergyToOtherVaccines' },
  { name: 'hasAllergyToMedications', labelKey: 'notification.severe.hasAllergyToMedications' },
  {
    name: 'hasAllergyToPreviousSameVaccine',
    labelKey: 'notification.severe.hasAllergyToPreviousSameVaccine',
  },
] as const;

// The flags that open the medical-history gate in the severe branch (SPEC FE12e §3.6):
// `hasRelevantMedicalHistory` from the header plus the four above. The non-severe branch is
// opened by the header one alone — the form's non-severe text is a copy of the severe one and
// this spec corrects it (§2).
const HEADER_HISTORY_FLAG = {
  name: 'hasRelevantMedicalHistory',
  labelKey: 'notification.fields.hasRelevantMedicalHistory',
} as const;
const SEVERE_GATE_FLAGS = [HEADER_HISTORY_FLAG, ...SEVERE_HISTORY_FLAGS] as const;

// The sections of step 4, which SPEC FE12f reveals one by one. `description` heads the list —
// `esaviDescription` is the header's only save blocker, so nothing can be persisted before it is
// written. The last two carry no advance button: nothing downstream depends on them and the
// action bar sits right below (§3.1).
type NotificationSectionId =
  | 'description'
  | 'background'
  | 'medicalHistory'
  | 'medications'
  | 'pregnancy'
  | 'vaccinationBackground'
  | 'verificationSource'
  | 'vaccines'
  | 'events'
  | 'outcome'
  | 'observations';

// The heading of every section that can be revealed, for the live region and nothing else (SPEC
// FE12f §3.7). All of them are FE12e keys already: announcing an advance names the section, it does
// not add a string. `observations` is absent on purpose — it never is the target of an advance,
// because it surfaces together with `outcome`, which is what gets announced.
const SECTION_TITLE_KEYS: Partial<Record<NotificationSectionId, string>> = {
  description: 'notification.section.description',
  background: 'notification.section.background',
  medicalHistory: 'notification.section.medicalHistory',
  medications: 'notification.section.medication',
  pregnancy: 'notification.pregnancy.sectionTitle',
  vaccinationBackground: 'notification.section.vaccinationBackground',
  verificationSource: 'notification.section.verification',
  vaccines: 'notification.section.vaccines',
  events: 'notification.section.events',
  outcome: 'notification.section.outcome',
};

function NotificationStepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-9 w-full max-w-sm" />
    </div>
  );
}

// `caseId`/`notificationType` never travel from the form (SPEC FE12a §3.5) — the caller adds them
// when building the `POST` body. `deathDate`/`autopsyRequested`/`verbalAutopsyPerformed` always
// travel explicitly — `null` when the death section is hidden, whatever the form holds when it's
// visible — so the same `PUT` that moves the outcome away from `DEATH` also clears the three
// (§3.5 "al ocultarse pone los tres campos a null").
function buildNotificationPayload(
  values: NotificationFormValues,
): Partial<CreateNotificationInput> {
  return {
    esaviDescription: values.esaviDescription.trim(),
    hasRelevantMedicalHistory: values.hasRelevantMedicalHistory ?? null,
    takesMedication: values.takesMedication ?? null,
    outcomeItemId: values.outcomeItemId ?? null,
    // Never `null` (§3.3) — while unanswered it simply does not travel, matching what
    // `notificationSaveSchema` already allows.
    ...(values.requestInvestigation !== undefined
      ? { requestInvestigation: values.requestInvestigation }
      : {}),
    deathDate: values.deathDate ?? null,
    autopsyRequested: values.autopsyRequested ?? null,
    verbalAutopsyPerformed: values.verbalAutopsyPerformed ?? null,
    notes: values.notes ?? null,
  };
}

function buildSeverePayload(
  values: NotificationFormValues,
): Partial<CreateSevereNotificationInput> {
  return {
    hasPreviousEventHistory: values.hasPreviousEventHistory ?? null,
    hasAllergyToOtherVaccines: values.hasAllergyToOtherVaccines ?? null,
    hasAllergyToMedications: values.hasAllergyToMedications ?? null,
    hasAllergyToPreviousSameVaccine: values.hasAllergyToPreviousSameVaccine ?? null,
    // Los dos de embarazo llegan en SPEC FE12a §4 paso 13, con la compuerta — hasta entonces
    // viajan en `null`, que es su estado coherente sin compuerta abierta.
    hasPregnancyComplications: values.hasPregnancyComplications ?? null,
    pregnancyComplicationsDescription: values.pregnancyComplicationsDescription ?? null,
    notes: values.severeNotes ?? null,
  };
}

function buildNonSeverePayload(
  values: NotificationFormValues,
): Partial<CreateNonSevereNotificationInput> {
  return {
    vaccinationHealthFacilityId: values.vaccinationHealthFacilityId ?? null,
    vaccinationSiteItemId: values.vaccinationSiteItemId ?? null,
    vaccinationCenterAddress: values.vaccinationCenterAddress ?? null,
    vaccinationGeoLocationId: values.vaccinationGeoLocationId ?? null,
    verifiedPhysicalDocument: values.verifiedPhysicalDocument ?? null,
    verifiedElectronicRecord: values.verifiedElectronicRecord ?? null,
    verifiedVerbalReport: values.verifiedVerbalReport ?? null,
    verifiedClinicalRecord: values.verifiedClinicalRecord ?? null,
    verifiedUnknown: values.verifiedUnknown ?? null,
    verifiedOtherSource: values.verifiedOtherSource ?? null,
    otherSourceDescription: values.otherSourceDescription ?? null,
    notes: values.nonSevereNotes ?? null,
  };
}

function buildPregnancyPayload(
  values: NotificationFormValues,
): Partial<CreateNotificationPregnancyInput> {
  return {
    // El contrato declara `wasPregnantAtVaccination` sin `| null` porque el `001` nunca la acepta
    // vacía (§3.3) — pero el `004` sí (`notificationPregnancy.service.ts`, "nullable here although
    // it is required by the 001"), y `Partial<...>` sólo añade `| undefined`, no `| null`. El cast
    // es a propósito: en tiempo de ejecución el `null` explícito es justo lo que retira una
    // respuesta dada por error sobre una fila que ya existe (§3.3).
    wasPregnantAtVaccination: (values.wasPregnantAtVaccination ?? null) as AnswerOption | undefined,
    wasPregnantAtEsavi: values.wasPregnantAtEsavi ?? null,
    lastMenstruationDate: values.lastMenstruationDate ?? null,
    probableDeliveryDate: values.probableDeliveryDate ?? null,
    hasComplications: values.hasComplications ?? null,
    notes: values.pregnancyNotes ?? null,
  };
}

// Un i18n key por cada `path[0]` que `createNotificationCompleteSchema` puede señalar.
const PENDING_FIELD_LABEL_KEYS: Partial<Record<string, string>> = {
  hasRelevantMedicalHistory: 'notification.pending.hasRelevantMedicalHistory',
  takesMedication: 'notification.pending.takesMedication',
  outcomeItemId: 'notification.pending.outcomeItemId',
  requestInvestigation: 'notification.pending.requestInvestigation',
  deathDate: 'notification.pending.deathFields',
  hasPreviousEventHistory: 'notification.pending.hasPreviousEventHistory',
  hasAllergyToOtherVaccines: 'notification.pending.hasAllergyToOtherVaccines',
  hasAllergyToMedications: 'notification.pending.hasAllergyToMedications',
  hasAllergyToPreviousSameVaccine: 'notification.pending.hasAllergyToPreviousSameVaccine',
  hasPregnancyComplications: 'notification.pending.hasPregnancyComplications',
  pregnancyComplicationsDescription: 'notification.pending.pregnancyComplicationsDescription',
  vaccinationHealthFacilityId: 'notification.pending.vaccinationHealthFacilityId',
  vaccinationSiteItemId: 'notification.pending.vaccinationSiteItemId',
  vaccinationGeoLocationId: 'notification.pending.vaccinationGeoLocationId',
  verifiedAny: 'notification.pending.verifiedAny',
  otherSourceDescription: 'notification.pending.otherSourceDescription',
  events: 'notification.pending.atLeastOneEvent',
  vaccines: 'notificationVaccine.complete.missingVaccine',
  suspectedVaccine: 'notificationVaccine.complete.missingSuspected',
};

// Corre `createNotificationCompleteSchema` sobre los valores actuales del formulario en vez de
// replicar la matriz a mano (SPEC FE12a §4 paso 12) — ahora que las dos ramas están en pantalla,
// el schema ya conoce todo lo que hay que pedir. Un `path[0]` sin entrada en el mapa (los dos de
// embarazo, por ahora) simplemente no se lista — no revienta.
function computePendingFields(
  values: NotificationFormValues,
  context: NotificationCompleteContext,
  t: TFunction,
): string[] {
  const result = createNotificationCompleteSchema(context).safeParse(values);
  if (result.success) return [];
  const seen = new Set<string>();
  const pending: string[] = [];
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    const labelKey = PENDING_FIELD_LABEL_KEYS[key];
    if (labelKey) pending.push(t(labelKey));
  }
  return pending;
}

interface NotificationFormBodyProps {
  caseId: string;
  notification: NotificationDetail | null;
  severeNotification: SevereNotificationDetail | null;
  nonSevereNotification: NonSevereNotificationDetail | null;
  notificationPregnancy: NotificationPregnancyDetail | null;
  notificationType: 'SEVERE' | 'NON_SEVERE';
  eventDate: string | null;
  pregnancyGate: PregnancyGateState;
  // `PREGNANCY_FEMALE_SEX_ITEM` sin sembrar (SPEC FE12d §3.4, §3.6) — el bloque se muestra igual,
  // deshabilitado con su explicación, en vez de desaparecer.
  pregnancyConfigMissing: boolean;
  // Sólo para el toast de `NOTIFPRG_001_PATIENT_NOT_FEMALE` (§3.5, §4 paso 8): nombra el sexo que
  // el paciente tiene registrado. `name` ya llega en el idioma activo (§7.2, "el `catalogItem` que
  // trae `ESAVI-PATIENT-003`").
  patientSexName: string | null;
  // Caso cerrado (SPEC FE12b §3.6): las listas de satélites pasan a sólo lectura — sin «Añadir»
  // y sin acciones de fila. El aviso en sí lo pinta `CaseWizardPage` (FE08); esto sólo retira las
  // acciones que ese aviso ya explica que no aplican.
  isClosed: boolean;
  // El `GET` del bloque de embarazo falló (SPEC FE12d §4 paso 14): `readyToRenderForm` ya lo
  // espera para no parpadear, pero sin este banner el fallo quedaba en silencio y el bloque se
  // pintaba vacío como si no hubiera datos que leer.
  pregnancyLoadError: boolean;
  onRetryPregnancyLoad: () => void;
  // `existedOnMount` of SPEC FE12f §3.1: `stages.notification.exists` (ESAVI-CASEFLOW-006) as it
  // read when this body mounted. It arrives as a prop and is frozen below — the step is only
  // walked through section by section when it did not exist yet.
  stageExisted: boolean;
}

// The form itself (SPEC FE12a §3.5, §3.1): only mounted once `NotificationStep` resolved workflow
// + classification + (on reentry) the notification row and the matching branch, so
// `defaultValues` is correct on the first render — same pattern as `ClassificationFormBody`.
function NotificationFormBody({
  caseId,
  notification,
  severeNotification,
  nonSevereNotification,
  notificationPregnancy,
  notificationType,
  eventDate,
  pregnancyGate,
  pregnancyConfigMissing,
  patientSexName,
  isClosed,
  pregnancyLoadError,
  onRetryPregnancyLoad,
  stageExisted,
}: NotificationFormBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { registerStep, unregisterStep } = useCaseWizard();
  const create = notificationResource.useCreate();
  const update = notificationResource.useUpdate();
  const severeCreate = severeNotificationResource.useCreate();
  const severeUpdate = severeNotificationResource.useUpdate();
  const nonSevereCreate = nonSevereNotificationResource.useCreate();
  const nonSevereUpdate = nonSevereNotificationResource.useUpdate();
  const pregnancyCreate = notificationPregnancyResource.useCreate();
  const pregnancyUpdate = notificationPregnancyResource.useUpdate();
  const outcomeItems = useCatalogItemsByTypeCode('outcome');

  // Never in `useState` (SPEC FE12a §3.4, corrigiendo el mismo patrón de FE11 en el paso 2 de
  // este spec): se derivan de los props, que vienen de la caché escrita con `setQueryData` más
  // abajo. `POST` o `PUT` de cada rama se decide por lo que devolvió su propio `006`
  // (SPEC FE12a §7 riesgo), nunca por si la cabecera existe.
  const notificationId = notification?.notificationId ?? null;
  const severeNotificationId = severeNotification?.notificationId ?? null;
  const nonSevereNotificationId = nonSevereNotification?.notificationId ?? null;
  const pregnancyId = notificationPregnancy?.pregnancyId ?? null;

  // La misma clave que `<MedicationList>` consulta por su cuenta (TanStack Query la comparte, no
  // duplica la petición): aquí sólo hace falta el conteo para bloquear `takesMedication` en la
  // cabecera (SPEC FE12b §3.5, «la compuerta en su forma nueva»).
  const medications = useNotificationMedicationsByCase(caseId, notificationId !== null);
  const hasActiveMedications = (medications.data?.rows.length ?? 0) > 0;
  // La misma clave que `<MedicalHistoryList>` consulta por su cuenta: la compuerta, el bloqueo
  // de la bandera y el aviso de discrepancia se derivan en render de esta query, nunca de
  // invalidar la cabecera para enterarse de algo que ésta ya sabe (SPEC FE12e §3.4, punto 4).
  const medicalHistories = useNotificationMedicalHistoriesByCase(caseId, notificationId !== null);
  const hasActiveMedicalHistories = (medicalHistories.data?.rows.length ?? 0) > 0;
  // Ídem con `<EventList>`: el obligatorio de proceso «al menos un evento» (§4 paso 12) sólo
  // necesita el conteo, no las filas.
  const events = useNotificationEventsByCase(caseId, notificationId !== null);
  const hasAtLeastOneEvent = (events.data?.rows.length ?? 0) > 0;
  // La misma clave que `<VaccineList>` consulta por su cuenta: los dos obligatorios de proceso
  // de SPEC FE12c §2 ("al menos una vacuna", "al menos una sospechosa") sólo necesitan las filas
  // ya cargadas, ninguna petición propia.
  const vaccines = useNotificationVaccinesByCase(caseId, notificationId !== null);
  const hasAtLeastOneVaccine = (vaccines.data?.rows.length ?? 0) > 0;
  const hasAtLeastOneSuspectedVaccine = (vaccines.data?.rows ?? []).some((row) => row.isSuspected);
  // La derivación de §6.5 (SPEC FE12d §4 paso 11): misma clave de caché que
  // `<PregnancyComplicationList>` lee por su cuenta, sin petición propia. «Derivado en render, no
  // es estado» (§3.4 tabla) — nada aquí escribe el formulario; `handleValidSubmit` decide el envío
  // efectivo más abajo.
  const complications = useNotificationPregnancyComplicationsByPregnancy(
    pregnancyId ?? undefined,
    pregnancyId !== null,
  );
  const hasActiveComplications = (complications.data?.rows.length ?? 0) > 0;
  // `useCan()` decide aquí sólo qué frase se muestra, nunca si el control existe (§3.5, la línea
  // que §10.4 no quiere que se cruce): mientras `NOTIFMED-005A` siga en ADMIN, un USER no puede
  // borrar las filas y por tanto no puede cambiar la respuesta en absoluto.
  const canAdminSatellites = useCan(ROLE_LEVELS.ADMIN);

  const defaultValues: NotificationFormValues = {
    esaviDescription: notification?.esaviDescription ?? '',
    hasRelevantMedicalHistory: notification?.hasRelevantMedicalHistory ?? null,
    takesMedication: notification?.takesMedication ?? null,
    outcomeItemId: notification?.outcome?.catalogItemId ?? null,
    requestInvestigation: notification?.requestInvestigation,
    deathDate: notification?.deathDate ?? null,
    autopsyRequested: notification?.autopsyRequested ?? null,
    verbalAutopsyPerformed: notification?.verbalAutopsyPerformed ?? null,
    notes: notification?.notes ?? null,
    hasPreviousEventHistory: severeNotification?.hasPreviousEventHistory ?? null,
    hasAllergyToOtherVaccines: severeNotification?.hasAllergyToOtherVaccines ?? null,
    hasAllergyToMedications: severeNotification?.hasAllergyToMedications ?? null,
    hasAllergyToPreviousSameVaccine: severeNotification?.hasAllergyToPreviousSameVaccine ?? null,
    // Los dos de embarazo llegan en el paso 13, junto con su compuerta.
    hasPregnancyComplications: severeNotification?.hasPregnancyComplications ?? null,
    pregnancyComplicationsDescription:
      severeNotification?.pregnancyComplicationsDescription ?? null,
    severeNotes: severeNotification?.notes ?? null,
    vaccinationHealthFacilityId:
      nonSevereNotification?.vaccinationHealthFacility?.healthFacilityId ?? null,
    vaccinationSiteItemId: nonSevereNotification?.vaccinationSite?.catalogItemId ?? null,
    vaccinationCenterAddress: nonSevereNotification?.vaccinationCenterAddress ?? null,
    vaccinationGeoLocationId: nonSevereNotification?.vaccinationGeoLocation?.geoLocationId ?? null,
    verifiedPhysicalDocument: nonSevereNotification?.verifiedPhysicalDocument ?? null,
    verifiedElectronicRecord: nonSevereNotification?.verifiedElectronicRecord ?? null,
    verifiedVerbalReport: nonSevereNotification?.verifiedVerbalReport ?? null,
    verifiedClinicalRecord: nonSevereNotification?.verifiedClinicalRecord ?? null,
    verifiedUnknown: nonSevereNotification?.verifiedUnknown ?? null,
    verifiedOtherSource: nonSevereNotification?.verifiedOtherSource ?? null,
    otherSourceDescription: nonSevereNotification?.otherSourceDescription ?? null,
    nonSevereNotes: nonSevereNotification?.notes ?? null,
    // El bloque de embarazo (SPEC FE12d §3.5): sin fila todavía, los seis campos arrancan vacíos —
    // «Alta (sin fila todavía)» de §3.6, no un estado de error.
    wasPregnantAtVaccination: notificationPregnancy?.wasPregnantAtVaccination ?? null,
    wasPregnantAtEsavi: notificationPregnancy?.wasPregnantAtEsavi ?? null,
    lastMenstruationDate: notificationPregnancy?.lastMenstruationDate ?? null,
    probableDeliveryDate: notificationPregnancy?.probableDeliveryDate ?? null,
    hasComplications: notificationPregnancy?.hasComplications ?? null,
    pregnancyNotes: notificationPregnancy?.notes ?? null,
  };

  const form = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationSaveSchema) as Resolver<NotificationFormValues>,
    defaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  // El `updatedAt` de la fila en el momento de montar (SPEC FE12a §3.4) — nunca recalculado en
  // cada render, o la regla de conflicto compararía siempre contra sí misma. `null` si todavía no
  // hay cabecera, que es justo lo que la tabla de conflicto espera para "sin fila".
  const baseUpdatedAtRef = useRef(notification?.updatedAt ?? null);

  // Restaura o descarta el borrador al montar — "sólo al montar el paso. Nunca después" (SPEC
  // FE12a §3.4). Corre una sola vez: `hasResolvedDraftRef` evita que un re-render posterior (por
  // ejemplo, tras `setQueryData` del propio guardado) vuelva a evaluar la regla de conflicto.
  const hasResolvedDraftRef = useRef(false);
  useEffect(() => {
    if (hasResolvedDraftRef.current) return;
    hasResolvedDraftRef.current = true;
    const draft = useDraftsStore.getState().get(caseId, 'notification');
    const resolution = resolveDraftConflict(draft, baseUpdatedAtRef.current);
    if (resolution === 'noDraft') return;
    if (resolution === 'discard') {
      useDraftsStore.getState().clear(caseId, 'notification');
      toast.info(t('notification.draft.discarded'));
      return;
    }
    // 'restore': gana el borrador sobre los valores de la fila que `defaultValues` ya sembró.
    const draftValues = draft?.values as NotificationFormValues;
    (
      Object.entries(draftValues) as [
        keyof NotificationFormValues,
        NotificationFormValues[keyof NotificationFormValues],
      ][]
    ).forEach(([key, value]) => {
      form.setValue(key, value, { shouldDirty: true });
    });
    toast.info(t('notification.draft.restored'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchedValues = useWatch({ control: form.control }) as NotificationFormValues;

  // Escritura con rebote de 500 ms en cada cambio (SPEC FE12a §3.4): `persist` de `draftsStore`
  // escribe en `localStorage` en cada `set`, y sin rebote sería una escritura por tecla. Nunca
  // antes de que el borrador se resuelva (`hasResolvedDraftRef`), o el efecto de arriba pisaría
  // un borrador recién restaurado con los valores todavía sin aplicar del primer render.
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasResolvedDraftRef.current || !form.formState.isDirty) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      useDraftsStore
        .getState()
        .set(caseId, 'notification', watchedValues, baseUpdatedAtRef.current);
    }, 500);
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, [caseId, watchedValues, form.formState.isDirty]);

  // SPEC FE12e §3.6, derivado en render: la compuerta se abre con cualquier bandera en `'YES'`;
  // la sección se muestra si está abierta **o** si hay filas, y en ese segundo caso con el aviso
  // de discrepancia; y sólo se bloquea la **última** bandera en `'YES'` con filas activas — es la
  // única cuyo cambio dejaría filas huérfanas (§3.5).
  const gateFlags = notificationType === 'SEVERE' ? SEVERE_GATE_FLAGS : [HEADER_HISTORY_FLAG];
  const gateFlagsInYes = gateFlags.filter(({ name }) => watchedValues[name] === 'YES');
  const medicalHistoryGateOpen = gateFlagsInYes.length > 0;
  const lockedGateFlag =
    hasActiveMedicalHistories && gateFlagsInYes.length === 1 ? gateFlagsInYes[0].name : null;
  const showsMedicalHistorySection = medicalHistoryGateOpen || hasActiveMedicalHistories;

  const isDeathOutcome =
    outcomeItems.rows.find((row) => row.catalogItemId === watchedValues.outcomeItemId)?.value ===
    'DEATH';

  // Al ocultarse, limpia los tres campos a `null` (SPEC FE12a §3.5, §7): la sección deja de
  // mostrarse en cuanto el desenlace deja de ser `DEATH`, y sin esto los tres seguirían colgados
  // en el estado del formulario aunque ya no se vean — un `PUT` con esos valores fantasma
  // respondería `NOTIFCN_00X_DEATH_FIELDS_NOT_ALLOWED`.
  const wasDeathOutcomeRef = useRef(isDeathOutcome);
  useEffect(() => {
    if (wasDeathOutcomeRef.current && !isDeathOutcome) {
      form.setValue('deathDate', null, { shouldDirty: true });
      form.setValue('autopsyRequested', null, { shouldDirty: true });
      form.setValue('verbalAutopsyPerformed', null, { shouldDirty: true });
    }
    wasDeathOutcomeRef.current = isDeathOutcome;
  }, [isDeathOutcome, form]);

  // Regla del cliente (SPEC FE12a §3.5, decisión §6): el servicio incluye `eventDate` en la
  // respuesta precisamente para esta comparación, pero no la valida él mismo.
  const deathDateValid = isDeathDateNotBeforeEventDate(watchedValues.deathDate, eventDate);

  // Mismo mecanismo que la sección de fallecimiento: `otherSourceDescription` sólo se muestra con
  // `verifiedOtherSource === true`, y al ocultarse se limpia sin esperar a un segundo guardado.
  const wasVerifiedOtherSourceRef = useRef(watchedValues.verifiedOtherSource === true);
  useEffect(() => {
    const isVerifiedOtherSource = watchedValues.verifiedOtherSource === true;
    if (wasVerifiedOtherSourceRef.current && !isVerifiedOtherSource) {
      form.setValue('otherSourceDescription', null, { shouldDirty: true });
    }
    wasVerifiedOtherSourceRef.current = isVerifiedOtherSource;
  }, [watchedValues.verifiedOtherSource, form]);

  // La compuerta de embarazo puede cerrarse por un cambio en otro paso — sexo o fecha de
  // nacimiento del paciente, fecha del evento (`CASE-PROCESS.md` §7.4) — mientras esta pantalla
  // está montada; al cerrarse, limpia (§7.3) igual que las otras dos secciones condicionales.
  const wasPregnancyGateOpenRef = useRef(pregnancyGate !== 'hidden');
  useEffect(() => {
    const isPregnancyGateOpen = pregnancyGate !== 'hidden';
    if (wasPregnancyGateOpenRef.current && !isPregnancyGateOpen) {
      form.setValue('hasPregnancyComplications', null, { shouldDirty: true });
      form.setValue('pregnancyComplicationsDescription', null, { shouldDirty: true });
    }
    wasPregnancyGateOpenRef.current = isPregnancyGateOpen;
  }, [pregnancyGate, form]);

  const handleValidSubmit = useCallback(
    async (rawValues: NotificationFormValues) => {
      // La derivación de §6.5 se aplica aquí, al envío, no al formulario (§3.4 tabla "derivado en
      // render, no es estado") — con ≥1 complicación activa, lo que se guarda es `'YES'` en los
      // dos campos aunque el usuario no los haya tocado, sin que eso dispare un `PUT` propio: viaja
      // en las fases 2 y 3 de esta misma cadena.
      const values: NotificationFormValues = hasActiveComplications
        ? { ...rawValues, hasComplications: 'YES', hasPregnancyComplications: 'YES' }
        : rawValues;

      if (!isDeathDateNotBeforeEventDate(values.deathDate, eventDate)) {
        form.setError('deathDate', {
          type: 'client',
          message: 'notification.validation.deathDateBeforeEventDate',
        });
        return false;
      }

      // Fase 1 — la cabecera. `resolvedNotificationId` es lo que la rama necesita para
      // encadenarse en el mismo "Guardar" (SPEC FE12a §3.5, §6 "El guardado").
      let resolvedNotificationId = notificationId;
      const headerPayload = buildNotificationPayload(values);
      try {
        if (resolvedNotificationId) {
          await update.mutateAsync({ id: resolvedNotificationId, data: headerPayload });
        } else {
          const created = await create.mutateAsync({
            ...headerPayload,
            caseId,
            notificationType,
          } as CreateNotificationInput);
          resolvedNotificationId = created.notificationId;
          queryClient.setQueryData(notificationByCaseKey(caseId), created);
        }
        // El `001`/`004` sella `notificationStartedAt` y avanza el workflow (SPEC FE12a §3.4
        // punto 4) — sin invalidar esto, el stepper seguiría mostrando el paso como no iniciado.
        await queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
      } catch (err) {
        if (!(err instanceof EsaviApiError)) {
          throw err;
        }
        // Mismo mecanismo que `ClassificationStep` (SPEC FE11 §3.5): conmuta el armazón a sólo
        // lectura sin esperar el próximo `006` de workflow.
        if (err.code === 'CASEFLOW_012_CASE_CLOSED') {
          queryClient.setQueryData<CaseWorkflowDetail>(['caseWorkflow', 'byCase', caseId], (old) =>
            old ? { ...old, status: { ...old.status, code: 'CLOSED' } } : old,
          );
          toast.error(getErrorMessage(err));
          return false;
        }
        // El caso ya tiene notificación (SPEC FE12a §3.5 "Con comportamiento propio"): se
        // invalida y se recarga en vez de insistir con un segundo `POST`.
        if (err.code === 'NOTIFCN_001_CASE_ALREADY_NOTIFIED') {
          await queryClient.invalidateQueries({ queryKey: notificationByCaseKey(caseId) });
          toast.error(getErrorMessage(err));
          return false;
        }
        const field = notificationErrorFieldMap[err.code];
        if (field) {
          form.setError(field, { type: 'server', message: err.message });
          return false;
        }
        toast.error(getErrorMessage(err));
        return false;
      }

      // Fase 2 — la rama, con el `notificationId` que acaba de resolver la fase 1 (SPEC FE12a §4
      // paso 12). Si esto falla, la cabecera ya quedó creada y visible: no se deshace nada, y el
      // siguiente "Guardar" reintenta sólo la rama, porque `resolvedNotificationId` ya existe.
      const successToastKey = notificationId ? 'common.toast.updated' : 'common.toast.created';
      try {
        if (notificationType === 'SEVERE') {
          const branchPayload = buildSeverePayload(values);
          if (severeNotificationId) {
            await severeUpdate.mutateAsync({ id: severeNotificationId, data: branchPayload });
          } else {
            await severeCreate.mutateAsync({
              ...branchPayload,
              notificationId: resolvedNotificationId,
            } as CreateSevereNotificationInput);
          }
        } else {
          const branchPayload = buildNonSeverePayload(values);
          if (nonSevereNotificationId) {
            await nonSevereUpdate.mutateAsync({ id: nonSevereNotificationId, data: branchPayload });
          } else {
            await nonSevereCreate.mutateAsync({
              ...branchPayload,
              notificationId: resolvedNotificationId,
            } as CreateNonSevereNotificationInput);
          }
        }
        // Sin `toast.success`/`form.reset`/limpiar el borrador todavía (SPEC FE12d §4 paso 8): la
        // cadena sigue con el bloque de embarazo, y las tres acciones de cierre viven en un único
        // sitio al final de las tres fases, no una por tabla.
      } catch (err) {
        if (!(err instanceof EsaviApiError)) {
          throw err;
        }
        const alreadyExistsCode =
          notificationType === 'SEVERE'
            ? 'SEVNOT_001_ALREADY_EXISTS'
            : 'NSEVNOT_001_ALREADY_EXISTS';
        // Se trata como éxito (SPEC FE12a §3.5, §6): el `POST` anterior sí llegó, sólo se perdió
        // la respuesta — no hay nada que reintentar en esta fase, sólo releer con el `006` y
        // continuar la cadena hacia el bloque de embarazo (SPEC FE12d §4 paso 8: sin `return`).
        if (err.code === alreadyExistsCode) {
          await queryClient.invalidateQueries({
            queryKey:
              notificationType === 'SEVERE'
                ? severeNotificationByCaseKey(caseId)
                : nonSevereNotificationByCaseKey(caseId),
          });
        } else {
          const notSameTypeCode =
            notificationType === 'SEVERE'
              ? 'SEVNOT_001_NOTIFICATION_NOT_SEVERE'
              : 'NSEVNOT_001_NOTIFICATION_NOT_NON_SEVERE';
          // La gravedad ya no es la que esta pestaña creía (SPEC FE12a §3.5, §7 riesgo "dos
          // pestañas"): se invalida workflow y clasificación en vez de reintentar a ciegas.
          if (err.code === notSameTypeCode) {
            await queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
            await queryClient.invalidateQueries({ queryKey: ['classification'] });
            toast.error(getErrorMessage(err));
            return false;
          }
          const branchFieldMap =
            notificationType === 'SEVERE'
              ? severeNotificationErrorFieldMap
              : nonSevereNotificationErrorFieldMap;
          const field = branchFieldMap[err.code];
          if (field) {
            form.setError(field, { type: 'server', message: err.message });
            return false;
          }
          toast.error(getErrorMessage(err));
          return false;
        }
      }

      // Fase 3 — el bloque de embarazo (SPEC FE12d §4 paso 8), con el `resolvedNotificationId` que
      // ya resolvió la fase 1. Sólo se intenta detrás de la compuerta abierta y con la
      // configuración sembrada, y — decisión explícita, fuera de lo que dice el spec — únicamente
      // si ya existe la fila (siempre `004`, responda o no el usuario) o si el bloque tiene alguna
      // respuesta: un bloque intacto no dispara un `POST` que el usuario no pidió, mismo criterio
      // que FE12c no encadenó el `POST` de una vacuna sin identidad tras el de la cabecera.
      //
      // SPEC FE12f §3.5 — the trigger is `wasPregnantAtEsavi`, the first question on screen since
      // FE12e reordered the block. Keyed to `wasPregnantAtVaccination`, answering only the first
      // question and advancing would create no row, and Complications would stay hidden inside the
      // section with nothing explaining why.
      const attemptsPregnancyWrite =
        pregnancyGate !== 'hidden' &&
        !pregnancyConfigMissing &&
        (pregnancyId !== null || values.wasPregnantAtEsavi != null);

      if (attemptsPregnancyWrite) {
        try {
          const pregnancyPayload = buildPregnancyPayload(values);
          if (pregnancyId) {
            await pregnancyUpdate.mutateAsync({ id: pregnancyId, data: pregnancyPayload });
          } else {
            await pregnancyCreate.mutateAsync({
              ...pregnancyPayload,
              notificationId: resolvedNotificationId,
            } as CreateNotificationPregnancyInput);
          }
          await queryClient.invalidateQueries({
            queryKey: notificationPregnancyByNotificationKey(resolvedNotificationId ?? ''),
          });
        } catch (err) {
          if (!(err instanceof EsaviApiError)) {
            throw err;
          }
          // Los tres propios de §3.5 con toast propio — ninguno señala un campo del formulario que
          // el usuario pueda corregir ahí mismo.
          if (err.code === NOTIFPRG_PATIENT_NOT_FEMALE) {
            toast.error(
              t('notification.pregnancy.error.patientNotFemale', { sex: patientSexName ?? '—' }),
            );
            return false;
          }
          if (err.code === NOTIFPRG_SEX_CONFIG_MISSING) {
            // Mismo texto que el bloque deshabilitado por configuración (§3.6): no se presenta
            // como fallo del servidor, es un despliegue sin sembrar.
            toast.error(t('notification.pregnancy.notConfigured'));
            return false;
          }
          if (err.code === NOTIFPRG_ALREADY_EXISTS) {
            toast.error(t('notification.pregnancy.error.alreadyExists'));
            return false;
          }
          const field = notificationPregnancyErrorFieldMap[err.code];
          if (field) {
            form.setError(field, { type: 'server', message: err.message });
            return false;
          }
          toast.error(getErrorMessage(err));
          return false;
        }
      }

      // Fin de la cadena (SPEC FE12a §3.5, extendida por SPEC FE12d §4 paso 8): una sola
      // confirmación para las tres fases, no una por tabla.
      toast.success(t(successToastKey));
      form.reset(values);
      // Se borra en cuanto el guardado completo responde correctamente (SPEC FE12a §3.4) — no
      // antes, para que un fallo en cualquier fase deje el borrador como red de seguridad de lo
      // que todavía no llegó a guardarse.
      useDraftsStore.getState().clear(caseId, 'notification');
      // SPEC FE12f §3.5: the chain reports whether it resolved so «Guardar y continuar» only
      // reveals the next section when it did. Every early return above answers `false`, and a
      // failed advance leaves the screen exactly where it was.
      return true;
    },
    [
      caseId,
      create,
      eventDate,
      form,
      hasActiveComplications,
      nonSevereCreate,
      nonSevereNotificationId,
      nonSevereUpdate,
      notificationId,
      notificationType,
      patientSexName,
      pregnancyConfigMissing,
      pregnancyCreate,
      pregnancyGate,
      pregnancyId,
      pregnancyUpdate,
      queryClient,
      severeCreate,
      severeNotificationId,
      severeUpdate,
      t,
      update,
    ],
  );

  // The action bar's «Guardar» keeps its exact contract (`Promise<void>`): the outcome the chain
  // now reports is only read by the advance button below (SPEC FE12f §8, `CaseWizardActionBar` and
  // `CaseWizardContext` do not change).
  const performSave = useCallback(async () => {
    await form.handleSubmit(handleValidSubmit)();
  }, [form, handleValidSubmit]);

  // The same `performSave` the action bar registers, but reporting the outcome (SPEC FE12f §3.2:
  // "cada avance es la cadena completa de FE12a, no un guardado parcial"). A schema error never
  // reaches the submit handler, so `saved` stays `false` and nothing is revealed.
  const performSaveAndReport = useCallback(async () => {
    let saved = false;
    await form.handleSubmit(async (values) => {
      saved = await handleValidSubmit(values);
    })();
    return saved;
  }, [form, handleValidSubmit]);

  // The sections that apply today, in DOM order — never the nine or eleven theoretical ones (SPEC
  // FE12f §3.1). A closed gate or a male patient drops the section from the list, so it neither
  // renders nor counts as an advance.
  // The same gate `<MedicationList>` applies to itself (SPEC FE12b §3.5): with `takesMedication`
  // outside `'YES'` and no active rows it renders nothing, so it must not take a turn either — an
  // advance that reveals an empty stretch of screen is the one thing this spec exists to remove.
  const showsMedicationSection = watchedValues.takesMedication === 'YES' || hasActiveMedications;

  const sections: NotificationSectionId[] = [
    'description',
    'background',
    ...(showsMedicalHistorySection ? (['medicalHistory'] as const) : []),
    ...(showsMedicationSection ? (['medications'] as const) : []),
    ...(pregnancyGate !== 'hidden' ? (['pregnancy'] as const) : []),
    ...(notificationType === 'NON_SEVERE'
      ? (['vaccinationBackground', 'verificationSource'] as const)
      : []),
    'vaccines',
    'events',
    'outcome',
    'observations',
  ];

  // Read once, frozen on purpose (SPEC FE12f §3.4): re-reading it would let the row created by the
  // first advance reveal the whole step. A closed case enters the same branch — everything visible,
  // no advance button, read-only as before.
  const revealAllRef = useRef(stageExisted || isClosed);
  const { isVisible, frontier, advance } = useProgressiveSections<NotificationSectionId>({
    sections,
    revealAll: revealAllRef.current,
    lastWithButton: 'events',
  });

  // The section the next advance will reveal, read before advancing: once `advance()` runs the
  // frontier has already moved on.
  const nextSection = frontier ? (sections[sections.indexOf(frontier) + 1] ?? null) : null;

  const sectionsRef = useRef<HTMLDivElement>(null);
  const [revealedSection, setRevealedSection] = useState<NotificationSectionId | null>(null);
  const announcementKey = revealedSection ? SECTION_TITLE_KEYS[revealedSection] : undefined;

  const handleAdvance = useCallback(async () => {
    if (await performSaveAndReport()) {
      advance();
      setRevealedSection(nextSection);
    }
  }, [advance, nextSection, performSaveAndReport]);

  // Focus lands on the heading of the section just revealed and brings it into view (SPEC FE12f
  // §3.7): otherwise whoever pressed the button with the keyboard stays at the end of the document
  // and a screen reader never learns that anything appeared. Every heading carries `tabIndex={-1}`
  // — the four rendered by components included, through `<SatelliteList>` and the three sections
  // of the non-severe branch.
  useEffect(() => {
    if (!revealedSection) return;
    const heading = sectionsRef.current?.querySelector<HTMLElement>(
      `[data-section="${revealedSection}"] h3`,
    );
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [revealedSection]);

  // The single advance button on screen, at the end of the section that holds the frontier (SPEC
  // FE12f §3.7): full width below `md`, right-aligned on desktop, 44px touch target. Disabled
  // while the chain is in flight; the footer bar keeps working throughout.
  const renderAdvanceButton = (id: NotificationSectionId) =>
    frontier === id ? (
      <Button
        type="button"
        className="min-h-11 w-full md:w-auto md:self-end"
        disabled={form.formState.isSubmitting}
        onClick={() => void handleAdvance()}
      >
        {t('caseWizard.actions.saveAndContinue')}
      </Button>
    ) : null;

  const pendingFields = computePendingFields(
    watchedValues,
    {
      notificationType,
      isDeathOutcome,
      pregnancyGateOpen: pregnancyGate !== 'hidden',
      hasAtLeastOneEvent,
      hasAtLeastOneVaccine,
      hasAtLeastOneSuspectedVaccine,
    },
    t,
  );

  // Leídos por referencia, nunca capturados por valor (SPEC FE11 §9, replicado desde el
  // principio por SPEC FE12a §4 paso 10): `registerStep` sólo se vuelve a llamar cuando
  // `isDirty` cambia, no en cada tecla — depender de `pendingFields`/`performSave` en el array de
  // dependencias reabre el `CaseWizardProvider` en cada cambio y produce un bucle sin fin.
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;
  const pendingFieldsRef = useRef(pendingFields);
  pendingFieldsRef.current = pendingFields;

  useEffect(() => {
    registerStep({
      save: () => performSaveRef.current(),
      isDirty: form.formState.isDirty,
      getPendingFields: () => pendingFieldsRef.current,
    });
    return () => unregisterStep();
    // `hasAtLeastOneEvent` entra en las dependencias a propósito (SPEC FE12b §4 paso 12): a
    // diferencia del resto de `pendingFields`, que sólo cambian cuando el formulario se ensucia,
    // éste depende de una consulta que puede resolver después del montaje sin que el usuario
    // haya tocado nada — sin este disparador, `CaseWizardProvider` seguiría leyendo el
    // `activeStep` de antes de que los eventos (o las vacunas, SPEC FE12c §4 paso 11) cargaran.
  }, [
    registerStep,
    unregisterStep,
    form.formState.isDirty,
    hasAtLeastOneEvent,
    hasAtLeastOneVaccine,
    hasAtLeastOneSuspectedVaccine,
  ]);

  return (
    <div ref={sectionsRef} className="flex flex-col gap-6">
      {/* The advance announcement (SPEC FE12f §3.7): the heading of the revealed section, with the
          key FE12e already defines. Visually hidden — the heading itself, which also takes focus,
          is the visible cue. */}
      <p aria-live="polite" className="sr-only">
        {announcementKey ? t(announcementKey) : ''}
      </p>

      {/* The first section of the walkthrough (SPEC FE12f §3.1, corrected while implementing):
          `esaviDescription` is the only field that blocks the header save (`CASE-PROCESS.md` §4.6),
          so no parent row can exist before it is written — and with no parent row no advance is
          possible at all. That is why it opens the step instead of closing it. */}
      {isVisible('description') && (
        <section data-section="description" className="flex flex-col gap-4">
          <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
            {t('notification.section.description')}
          </h3>

          <Controller
            control={form.control}
            name="esaviDescription"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="notification-esaviDescription"
                  className="text-sm font-medium text-foreground"
                >
                  {t('notification.fields.esaviDescription')}
                </label>
                <Textarea
                  id="notification-esaviDescription"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value)}
                />
                {fieldState.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('notification.validation.esaviDescriptionRequired')}
                  </p>
                )}
              </div>
            )}
          />
          {renderAdvanceButton('description')}
        </section>
      )}

      {isVisible('background') && (
        <section data-section="background" className="flex flex-col gap-4">
          <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
            {t('notification.section.background')}
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* La bandera de la cabecera y, en rama grave, las cuatro de la ficha, en línea entre
              ella y `takesMedication` (SPEC FE12e §3.1 sección 1). Se pintan de una lista porque
              comparten forma, orden y compuerta: la que quede sola en `'YES'` con antecedentes
              cargados es la que se bloquea (§3.5). */}
            {gateFlags.map(({ name, labelKey }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">{t(labelKey)}</span>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <AnswerOptionField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t(labelKey)}
                      variant="unknown"
                      disabled={lockedGateFlag === name}
                      ariaDescribedBy={
                        lockedGateFlag === name ? `medicalHistory-gateLocked-${name}` : undefined
                      }
                    />
                  )}
                />
                {lockedGateFlag === name && (
                  <p
                    id={`medicalHistory-gateLocked-${name}`}
                    className="text-sm text-muted-foreground"
                  >
                    {t(
                      canAdminSatellites
                        ? 'notification.medicalHistory.gateLocked'
                        : 'notification.medicalHistory.gateLockedNeedsAdmin',
                    )}
                  </p>
                )}
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.fields.takesMedication')}
              </span>
              <Controller
                control={form.control}
                name="takesMedication"
                render={({ field }) => (
                  <AnswerOptionField
                    value={field.value ?? null}
                    onChange={field.onChange}
                    ariaLabel={t('notification.fields.takesMedication')}
                    variant="unknown"
                    disabled={hasActiveMedications}
                  />
                )}
              />
              {/* No es un aviso al guardar: es un campo que no se puede mover mientras haya datos que
                quedarían huérfanos (SPEC FE12b §3.5). El texto asociado, no sólo el atributo
                `disabled` (§3.7) — un control gris sin motivo es indistinguible de un fallo. */}
              {hasActiveMedications && (
                <p className="text-sm text-muted-foreground">
                  {t(
                    canAdminSatellites
                      ? 'notification.medications.gateLocked'
                      : 'notification.medications.gateLockedNeedsAdmin',
                  )}
                </p>
              )}
            </div>
          </div>

          {/* `severeNotes` cierra la sección de banderas y no el bloque de embarazo (SPEC FE12e §3.1,
            §6): el embarazo ya tiene su `pregnancyNotes`, y dos campos de notas seguidos en la misma
            caja son indistinguibles para quien rellena. */}
          {notificationType === 'SEVERE' && (
            <Controller
              control={form.control}
              name="severeNotes"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="severeNotification-notes"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('notification.fields.notes')}
                  </label>
                  <Textarea
                    id="severeNotification-notes"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                  />
                </div>
              )}
            />
          )}
          {renderAdvanceButton('background')}
        </section>
      )}

      {/* Section 2 (SPEC FE12e §3.1), detrás de la compuerta de §3.6: con la compuerta cerrada y
          sin filas **no existe en el DOM**, no basta con ocultarla. Con filas y ninguna bandera
          en `'YES'` se muestra igual, con el aviso de discrepancia — que aparece al mover una
          bandera y no al guardar, y por eso va en una región viva (§3.7). `isVisible` ya lleva
          dentro la compuerta: la sección sólo entra en la secuencia de FE12f cuando se muestra. */}
      {isVisible('medicalHistory') && (
        <section data-section="medicalHistory" className="flex flex-col gap-3">
          <div aria-live="polite">
            {!medicalHistoryGateOpen && (
              <p className="text-sm text-muted-foreground">
                {t('notification.medicalHistory.mismatch')}
              </p>
            )}
          </div>
          <MedicalHistoryList caseId={caseId} notificationId={notificationId} readOnly={isClosed} />
          {renderAdvanceButton('medicalHistory')}
        </section>
      )}

      {/* Sólo existen con la fila de `notification` ya creada (SPEC FE12b §3.6): sin
          `notificationId` no hay padre al que colgar ningún satélite. Desde FE12f ese estado deja
          de ser alcanzable en el recorrido normal — la sección no se revela antes de que el primer
          avance haya creado el padre (§3.1). */}
      {isVisible('medications') && (
        <div data-section="medications" className="contents">
          <MedicationList
            caseId={caseId}
            notificationId={notificationId}
            readOnly={isClosed}
            takesMedication={watchedValues.takesMedication ?? null}
          />
          {renderAdvanceButton('medications')}
        </div>
      )}

      {/* Detrás de la compuerta de `CASE-PROCESS.md` §7.4 (SPEC FE12d §4 paso 7): independiente
          de la rama, así que va antes de la que corresponda por gravedad. Su único botón hace dos
          cosas en una pulsación (SPEC FE12f §6): crea la fila de embarazo —que revela
          Complicaciones dentro de esta misma sección— y avanza a la siguiente. */}
      {isVisible('pregnancy') && (
        <div data-section="pregnancy" className="contents">
          <PregnancySection
            control={form.control}
            pregnancyGate={pregnancyGate}
            configMissing={pregnancyConfigMissing}
            pregnancyId={pregnancyId}
            isClosed={isClosed}
            complicationsDerived={hasActiveComplications}
            loadError={pregnancyLoadError}
            onRetryLoad={onRetryPregnancyLoad}
            showsSevereComplications={notificationType === 'SEVERE'}
            hasPregnancyComplications={watchedValues.hasPregnancyComplications}
            pregnancyComplicationsDescription={watchedValues.pregnancyComplicationsDescription}
          />
          {renderAdvanceButton('pregnancy')}
        </div>
      )}

      {isVisible('vaccinationBackground') && (
        <div data-section="vaccinationBackground" className="contents">
          <VaccinationBackgroundSection
            control={form.control}
            initialHealthFacilityLabel={
              nonSevereNotification?.vaccinationHealthFacility?.name ?? null
            }
          />
          {renderAdvanceButton('vaccinationBackground')}
        </div>
      )}

      {isVisible('verificationSource') && (
        <div data-section="verificationSource" className="contents">
          <VerificationSourceSection
            control={form.control}
            verifiedOtherSource={watchedValues.verifiedOtherSource}
            otherSourceDescription={watchedValues.otherSourceDescription}
          />
          {renderAdvanceButton('verificationSource')}
        </div>
      )}

      {isVisible('vaccines') && (
        <div data-section="vaccines" className="contents">
          <VaccineList
            caseId={caseId}
            notificationId={notificationId}
            eventDate={eventDate}
            readOnly={isClosed}
            showsDiluents={notificationType === 'SEVERE'}
          />
          {renderAdvanceButton('vaccines')}
        </div>
      )}

      {isVisible('events') && (
        <div data-section="events" className="contents">
          <EventList caseId={caseId} notificationId={notificationId} readOnly={isClosed} />
          {renderAdvanceButton('events')}
        </div>
      )}

      {/* Las dos últimas se revelan juntas con el último avance (SPEC FE12f §3.1): ninguna
          desbloquea nada y la barra de acciones ya está justo debajo. */}
      {isVisible('outcome') && (
        <section data-section="outcome" className="flex flex-col gap-4">
          <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
            {t('notification.section.outcome')}
          </h3>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('notification.fields.outcomeItemId')}
            </span>
            <Controller
              control={form.control}
              name="outcomeItemId"
              render={({ field }) => (
                <CatalogSelect
                  typeCode="outcome"
                  emit="id"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('notification.fields.outcomeItemId')}
                />
              )}
            />
          </div>

          {/* Sólo aparece con outcome.value === 'DEATH' (SPEC FE12a §3.5, §7) — nunca con `code` ni
            `name`, que pertenecen al catálogo del país (SPEC F46). `aria-live="polite"` porque
            aparece por un cambio en otro control: sin el anuncio, un lector de pantalla no se
            entera de que acaban de aparecer tres campos, dos de ellos obligatorios. */}
          <div aria-live="polite">
            {isDeathOutcome && (
              <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                <span className="text-sm font-medium text-foreground">
                  {t('notification.death.sectionTitle')}
                </span>

                <Controller
                  control={form.control}
                  name="deathDate"
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        {t('notification.death.deathDate')}
                      </span>
                      <DateField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        ariaLabel={t('notification.death.deathDate')}
                        allowFuture={false}
                      />
                      {!deathDateValid && (
                        <p role="alert" className="text-sm text-destructive">
                          {t('notification.validation.deathDateBeforeEventDate')}
                        </p>
                      )}
                    </div>
                  )}
                />

                <Controller
                  control={form.control}
                  name="autopsyRequested"
                  render={({ field }) => (
                    <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={field.onChange}
                        aria-label={t('notification.death.autopsyRequested')}
                      />
                      {t('notification.death.autopsyRequested')}
                    </label>
                  )}
                />

                <Controller
                  control={form.control}
                  name="verbalAutopsyPerformed"
                  render={({ field }) => (
                    <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={field.onChange}
                        aria-label={t('notification.death.verbalAutopsyPerformed')}
                      />
                      {t('notification.death.verbalAutopsyPerformed')}
                    </label>
                  )}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('notification.fields.requestInvestigation')}
            </span>
            <p className="text-sm text-muted-foreground">
              {t('notification.help.requestInvestigation')}
            </p>
            <Controller
              control={form.control}
              name="requestInvestigation"
              render={({ field }) => (
                <RadioGroup
                  aria-label={t('notification.fields.requestInvestigation')}
                  // Cadena vacía, no `undefined`, mientras no se responda — mismo motivo que la
                  // compuerta de gravedad de `ClassificationStep` (Radix trata un `RadioGroup` sin
                  // `value` inicial como no controlado).
                  value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                  onValueChange={(next) => field.onChange(next === 'true')}
                  className="flex w-auto gap-4"
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <RadioGroupItem value="true" />
                    {t('common.answerOption.yes')}
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <RadioGroupItem value="false" />
                    {t('common.answerOption.no')}
                  </label>
                </RadioGroup>
              )}
            />
          </div>
        </section>
      )}

      {isVisible('observations') && (
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="notification-notes" className="text-sm font-medium text-foreground">
                {t('notification.fields.notes')}
              </label>
              <Textarea
                id="notification-notes"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
              />
            </div>
          )}
        />
      )}
    </div>
  );
}

export interface NotificationStepProps {
  caseId: string;
}

// Paso 4 del wizard (SPEC FE12a): la cabecera de la notificación. Reemplaza el marcador `<div>`
// de `CaseWizardPage.tsx` para el slug `notification`. `notificationType` sale de
// `classification.isSeriousEvent` y no se muestra como campo editable (§2, §3.5).
export function NotificationStep({ caseId }: NotificationStepProps) {
  const { t } = useTranslation();
  const workflow = useCaseWorkflow(caseId);
  const esaviCase = esaviCaseResource.useOne(caseId);
  const stageExists = workflow.data?.stages.notification.exists === true;
  // `006` sólo se llama en reentrada (mismo motivo que `useClassificationByCase`, SPEC FE11 §3.2).
  const classificationStageExists = workflow.data?.stages.classification.exists === true;
  const classification = useClassificationByCase(caseId, classificationStageExists);
  const notification = useNotificationByCase(caseId, stageExists);
  // `notificationType` no existe todavía si `classification` no ha resuelto — los dos hooks de
  // rama, igual que todos los demás, se llaman siempre (reglas de los hooks) y se autogobiernan
  // por su propio `enabled` (SPEC FE12a §4 paso 8, corregido en el paso 12: también exige
  // `stageExists`, no sólo el tipo).
  const notificationTypeMaybe = classification.data
    ? classification.data.isSeriousEvent
      ? ('SEVERE' as const)
      : ('NON_SEVERE' as const)
    : undefined;
  const severeNotification = useSevereNotificationByCase(
    caseId,
    notificationTypeMaybe,
    stageExists,
  );
  const nonSevereNotification = useNonSevereNotificationByCase(
    caseId,
    notificationTypeMaybe,
    stageExists,
  );
  const activeBranch =
    notificationTypeMaybe === 'SEVERE'
      ? severeNotification
      : notificationTypeMaybe === 'NON_SEVERE'
        ? nonSevereNotification
        : null;

  // `usePregnancyGate` (SPEC FE12d §4 paso 6) sustituye la resolución en línea que dejó FE12a: la
  // respuesta de `ESAVI-PATIENT-003` ya trae `sex` resuelto, sin necesidad de un segundo salto de
  // catálogo, y la edad viene ya calculada por `classification`, nunca reimplementada. `patient`
  // se sigue leyendo aquí, aparte del hook, sólo para el `readyToRenderForm` de abajo — comparte
  // caché con la lectura interna del hook, no repite la petición.
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');
  const pregnancyGate = usePregnancyGate(caseId);

  // El bloque de embarazo (SPEC FE12d §4 paso 7): sin `notificationId` todavía no hay fila que
  // leer (§3.6 «Alta, sin fila todavía»), así que el hook se autogobierna con su propio `enabled`
  // — mismo patrón que `severeNotification`/`nonSevereNotification` de arriba. La fila de
  // configuración se pide siempre: `useSystemConfigByCode` ya trae su `staleTime` de 30 minutos y
  // comparte caché con la lectura interna de `usePregnancyGate` (§3.4).
  const notificationId = notification.data?.notificationId ?? null;
  const notificationPregnancy = useNotificationPregnancyByNotification(
    notificationId ?? undefined,
    notificationId !== null,
  );
  const femaleSexConfig = useSystemConfigByCode(PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE);
  const pregnancyConfigMissing = femaleSexConfig.data === null;

  // Set on the first render that mounts the body, and never cleared (SPEC FE12f §3.4, decided
  // while implementing): a query that only becomes enabled after the first advance — the branch
  // row, the pregnancy block — turns `readyToRenderForm` false for a moment, and swapping the
  // form back for the skeleton would unmount it, taking the frozen `existedOnMount` and the
  // progressive position with it.
  const formEverRenderedRef = useRef(false);

  const readyToRenderForm =
    !!workflow.data &&
    !!esaviCase.data &&
    !!classification.data &&
    // Esperar a `patient` evita el parpadeo de pintar el bloque de embarazo y ocultarlo un
    // instante después en cuanto se resuelve el sexo real (mismo motivo que `ClassificationStep`
    // espera `readyToResolveAge`, SPEC FE11 §3.6).
    (!!patient.data || patient.isError) &&
    (!stageExists || (!!notification.data && activeBranch?.data !== undefined)) &&
    // Ídem con el bloque de embarazo: sin `notificationId` no hay nada que esperar (la consulta ni
    // corre), y con la compuerta cerrada tampoco — sólo espera cuando de verdad hay algo que leer.
    (notificationId === null ||
      pregnancyGate === 'hidden' ||
      notificationPregnancy.data !== undefined ||
      notificationPregnancy.isError);

  // `stages.classification.exists` cuenta también filas desactivadas (`CASE-PROCESS.md` §6.2:
  // "exists no significa utilizable") — el propio `006` de classification filtra por `isActive`
  // para cualquiera que no sea SUPERADMIN, así que un `USER` ve `404 CLASSIF_006_NOT_FOUND` justo
  // cuando el workflow dice que la clasificación existe. No es el estado de error genérico: es
  // que hace falta reactivarla antes de notificar (SPEC FE12a §3.6, §4 paso 16).
  const classificationInactive =
    classificationStageExists &&
    classification.isError &&
    classification.error instanceof EsaviApiError &&
    classification.error.code === 'CLASSIF_006_NOT_FOUND';

  if (classificationInactive) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('notification.blocked.classificationInactive')}
      </p>
    );
  }

  const loadError = notification.error ?? activeBranch?.error;
  if (notification.isError || activeBranch?.isError) {
    const message =
      loadError instanceof EsaviApiError
        ? getErrorMessage(loadError)
        : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void notification.refetch();
            void activeBranch?.refetch();
          }}
        >
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  // The skeleton only stands in before the form exists. Inside that transient window the branch
  // row arrives as `null` for a render; a second advance there would `POST` again, which the chain
  // already reads as success (`SEVNOT_001_ALREADY_EXISTS`, SPEC FE12a §3.5).
  if (readyToRenderForm) formEverRenderedRef.current = true;
  if (!readyToRenderForm && !formEverRenderedRef.current) {
    return <NotificationStepSkeleton />;
  }

  const notificationType = notificationTypeMaybe as 'SEVERE' | 'NON_SEVERE';
  // Mismo criterio que `CaseWizardPage.tsx` (§10.3: la comprobación de `CLOSED` sigue entera en
  // el cliente, no la impone el servidor en estos satélites).
  const isClosed = workflow.data?.status.code === 'CLOSED';

  return (
    <NotificationFormBody
      caseId={caseId}
      notification={notification.data ?? null}
      severeNotification={severeNotification.data ?? null}
      nonSevereNotification={nonSevereNotification.data ?? null}
      notificationPregnancy={notificationPregnancy.data ?? null}
      notificationType={notificationType}
      eventDate={esaviCase.data?.eventDate ?? null}
      pregnancyGate={pregnancyGate}
      pregnancyConfigMissing={pregnancyConfigMissing}
      patientSexName={patient.data?.sex?.name ?? null}
      isClosed={isClosed}
      pregnancyLoadError={notificationPregnancy.isError}
      onRetryPregnancyLoad={() => void notificationPregnancy.refetch()}
      stageExisted={stageExists}
    />
  );
}
