import { useCallback, useEffect, useRef } from 'react';
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
import { PREGNANCY_FEMALE_SEX_ITEM_CONFIG_CODE, usePregnancyGate } from '@/shared/hooks/usePregnancyGate';
import { useSystemConfigByCode } from '@/shared/hooks/useSystemConfigByCode';
import { resolveDraftConflict, useDraftsStore } from '@/shared/stores/draftsStore';
import { esaviCaseResource } from './api';
import { useCaseWizard } from './CaseWizardContext';
import { NonSevereNotificationFields } from './NonSevereNotificationFields';
import { PregnancySection } from './PregnancySection';
import { SevereNotificationFields } from './SevereNotificationFields';

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
function buildNotificationPayload(values: NotificationFormValues): Partial<CreateNotificationInput> {
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

function buildSeverePayload(values: NotificationFormValues): Partial<CreateSevereNotificationInput> {
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

function buildPregnancyPayload(values: NotificationFormValues): Partial<CreateNotificationPregnancyInput> {
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
  const canAdminMedications = useCan(ROLE_LEVELS.ADMIN);

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
    pregnancyComplicationsDescription: severeNotification?.pregnancyComplicationsDescription ?? null,
    severeNotes: severeNotification?.notes ?? null,
    vaccinationHealthFacilityId: nonSevereNotification?.vaccinationHealthFacility?.healthFacilityId ?? null,
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
    (Object.entries(draftValues) as [keyof NotificationFormValues, NotificationFormValues[keyof NotificationFormValues]][]).forEach(
      ([key, value]) => {
        form.setValue(key, value, { shouldDirty: true });
      },
    );
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
      useDraftsStore.getState().set(caseId, 'notification', watchedValues, baseUpdatedAtRef.current);
    }, 500);
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, [caseId, watchedValues, form.formState.isDirty]);

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
        return;
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
          return;
        }
        // El caso ya tiene notificación (SPEC FE12a §3.5 "Con comportamiento propio"): se
        // invalida y se recarga en vez de insistir con un segundo `POST`.
        if (err.code === 'NOTIFCN_001_CASE_ALREADY_NOTIFIED') {
          await queryClient.invalidateQueries({ queryKey: notificationByCaseKey(caseId) });
          toast.error(getErrorMessage(err));
          return;
        }
        const field = notificationErrorFieldMap[err.code];
        if (field) {
          form.setError(field, { type: 'server', message: err.message });
          return;
        }
        toast.error(getErrorMessage(err));
        return;
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
          notificationType === 'SEVERE' ? 'SEVNOT_001_ALREADY_EXISTS' : 'NSEVNOT_001_ALREADY_EXISTS';
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
            return;
          }
          const branchFieldMap =
            notificationType === 'SEVERE' ? severeNotificationErrorFieldMap : nonSevereNotificationErrorFieldMap;
          const field = branchFieldMap[err.code];
          if (field) {
            form.setError(field, { type: 'server', message: err.message });
            return;
          }
          toast.error(getErrorMessage(err));
          return;
        }
      }

      // Fase 3 — el bloque de embarazo (SPEC FE12d §4 paso 8), con el `resolvedNotificationId` que
      // ya resolvió la fase 1. Sólo se intenta detrás de la compuerta abierta y con la
      // configuración sembrada, y — decisión explícita, fuera de lo que dice el spec — únicamente
      // si ya existe la fila (siempre `004`, responda o no el usuario) o si `wasPregnantAtVaccination`
      // tiene respuesta, lo único que el `001` exige: un bloque intacto no dispara un `POST` que el
      // usuario no pidió, mismo criterio que FE12c no encadenó el `POST` de una vacuna sin
      // identidad tras el de la cabecera.
      const attemptsPregnancyWrite =
        pregnancyGate !== 'hidden' &&
        !pregnancyConfigMissing &&
        (pregnancyId !== null || values.wasPregnantAtVaccination != null);

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
            toast.error(t('notification.pregnancy.error.patientNotFemale', { sex: patientSexName ?? '—' }));
            return;
          }
          if (err.code === NOTIFPRG_SEX_CONFIG_MISSING) {
            // Mismo texto que el bloque deshabilitado por configuración (§3.6): no se presenta
            // como fallo del servidor, es un despliegue sin sembrar.
            toast.error(t('notification.pregnancy.notConfigured'));
            return;
          }
          if (err.code === NOTIFPRG_ALREADY_EXISTS) {
            toast.error(t('notification.pregnancy.error.alreadyExists'));
            return;
          }
          const field = notificationPregnancyErrorFieldMap[err.code];
          if (field) {
            form.setError(field, { type: 'server', message: err.message });
            return;
          }
          toast.error(getErrorMessage(err));
          return;
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

  const performSave = useCallback(() => form.handleSubmit(handleValidSubmit)(), [form, handleValidSubmit]);

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
    <div className="flex flex-col gap-6">
      <Controller
        control={form.control}
        name="esaviDescription"
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="notification-esaviDescription" className="text-sm font-medium text-foreground">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.fields.hasRelevantMedicalHistory')}
          </span>
          <Controller
            control={form.control}
            name="hasRelevantMedicalHistory"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.fields.hasRelevantMedicalHistory')}
                variant="unknown"
              />
            )}
          />
        </div>

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
                canAdminMedications
                  ? 'notification.medications.gateLocked'
                  : 'notification.medications.gateLockedNeedsAdmin',
              )}
            </p>
          )}
        </div>
      </div>

      {/* Sólo existen con la fila de `notification` ya creada (SPEC FE12b §3.6): sin
          `notificationId` no hay padre al que colgar ningún satélite. */}
      <EventList caseId={caseId} notificationId={notificationId} readOnly={isClosed} />
      <MedicationList
        caseId={caseId}
        notificationId={notificationId}
        readOnly={isClosed}
        takesMedication={watchedValues.takesMedication ?? null}
      />
      <VaccineList caseId={caseId} notificationId={notificationId} eventDate={eventDate} readOnly={isClosed} />

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
        <p className="text-sm text-muted-foreground">{t('notification.help.requestInvestigation')}</p>
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

      {/* Detrás de la compuerta de `CASE-PROCESS.md` §7.4 (SPEC FE12d §4 paso 7): independiente
          de la rama, así que va antes de la que corresponda por gravedad. */}
      <PregnancySection
        control={form.control}
        pregnancyGate={pregnancyGate}
        configMissing={pregnancyConfigMissing}
        pregnancyId={pregnancyId}
        isClosed={isClosed}
        complicationsDerived={hasActiveComplications}
      />

      {notificationType === 'SEVERE' ? (
        <SevereNotificationFields
          control={form.control}
          pregnancyGate={pregnancyGate}
          hasPregnancyComplications={watchedValues.hasPregnancyComplications}
          pregnancyComplicationsDescription={watchedValues.pregnancyComplicationsDescription}
          complicationsDerived={hasActiveComplications}
        />
      ) : (
        <NonSevereNotificationFields
          control={form.control}
          initialHealthFacilityLabel={nonSevereNotification?.vaccinationHealthFacility?.name ?? null}
          verifiedOtherSource={watchedValues.verifiedOtherSource}
          otherSourceDescription={watchedValues.otherSourceDescription}
        />
      )}

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
  const severeNotification = useSevereNotificationByCase(caseId, notificationTypeMaybe, stageExists);
  const nonSevereNotification = useNonSevereNotificationByCase(caseId, notificationTypeMaybe, stageExists);
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
    return <p className="text-sm text-muted-foreground">{t('notification.blocked.classificationInactive')}</p>;
  }

  const loadError = notification.error ?? activeBranch?.error;
  if (notification.isError || activeBranch?.isError) {
    const message =
      loadError instanceof EsaviApiError ? getErrorMessage(loadError) : t('common.errors.unexpected');
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

  if (!readyToRenderForm) {
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
    />
  );
}
