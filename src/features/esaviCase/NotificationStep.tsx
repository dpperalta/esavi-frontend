import { useCallback, useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateNotificationInput } from '@/contracts/notification';
import type { NotificationDetail } from '@/contracts/declared/notification';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useClassificationByCase } from '@/features/classification/api';
import {
  notificationByCaseKey,
  notificationResource,
  useNotificationByCase,
} from '@/features/notification/api';
import {
  isDeathDateNotBeforeEventDate,
  isDeathFieldsRequirementMet,
  notificationErrorFieldMap,
  notificationSaveSchema,
  type NotificationFormValues,
} from '@/features/notification/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';
import { esaviCaseResource } from './api';
import { useCaseWizard } from './CaseWizardContext';

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

// Header-only for now (§4 paso 10): the two branches (paso 12) and the pregnancy gate (paso 13)
// aren't rendered yet, so `createNotificationCompleteSchema` of `features/notification/schemas.ts`
// isn't wired in here either — it would list pending fields for controls that don't exist on
// screen yet. This mirrors exactly what it will check once those steps land, just narrowed to
// what's actually on screen today.
function computeHeaderPendingFields(
  values: NotificationFormValues,
  isDeathOutcome: boolean,
  t: TFunction,
): string[] {
  const pending: string[] = [];
  if (!values.hasRelevantMedicalHistory) pending.push(t('notification.pending.hasRelevantMedicalHistory'));
  if (!values.takesMedication) pending.push(t('notification.pending.takesMedication'));
  if (!values.outcomeItemId) pending.push(t('notification.pending.outcomeItemId'));
  if (values.requestInvestigation === undefined) {
    pending.push(t('notification.pending.requestInvestigation'));
  }
  if (
    !isDeathFieldsRequirementMet(
      isDeathOutcome,
      values.deathDate,
      values.autopsyRequested,
      values.verbalAutopsyPerformed,
    )
  ) {
    pending.push(t('notification.pending.deathFields'));
  }
  return pending;
}

interface NotificationFormBodyProps {
  caseId: string;
  notification: NotificationDetail | null;
  notificationType: 'SEVERE' | 'NON_SEVERE';
  eventDate: string | null;
}

// The form itself (SPEC FE12a §3.5, §3.1): only mounted once `NotificationStep` resolved workflow
// + classification + (on reentry) the notification row, so `defaultValues` is correct on the
// first render — same pattern as `ClassificationFormBody`.
function NotificationFormBody({ caseId, notification, notificationType, eventDate }: NotificationFormBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { registerStep, unregisterStep } = useCaseWizard();
  const create = notificationResource.useCreate();
  const update = notificationResource.useUpdate();
  const outcomeItems = useCatalogItemsByTypeCode('outcome');

  // Never in `useState` (SPEC FE12a §3.4, corrigiendo el mismo patrón de FE11 en el paso 2 de
  // este spec): se deriva del prop, que viene de la caché escrita con `setQueryData` más abajo.
  const notificationId = notification?.notificationId ?? null;

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
    // Las dos ramas no se editan todavía (paso 12) — nacen en `null` sin que este paso las toque.
    hasPreviousEventHistory: null,
    hasAllergyToOtherVaccines: null,
    hasAllergyToMedications: null,
    hasAllergyToPreviousSameVaccine: null,
    hasPregnancyComplications: null,
    pregnancyComplicationsDescription: null,
    severeNotes: null,
    vaccinationHealthFacilityId: null,
    vaccinationSiteItemId: null,
    vaccinationCenterAddress: null,
    vaccinationGeoLocationId: null,
    verifiedPhysicalDocument: null,
    verifiedElectronicRecord: null,
    verifiedVerbalReport: null,
    verifiedClinicalRecord: null,
    verifiedUnknown: null,
    verifiedOtherSource: null,
    otherSourceDescription: null,
    nonSevereNotes: null,
  };

  const form = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationSaveSchema) as Resolver<NotificationFormValues>,
    defaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as NotificationFormValues;

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

  const handleValidSubmit = useCallback(
    async (values: NotificationFormValues) => {
      if (!isDeathDateNotBeforeEventDate(values.deathDate, eventDate)) {
        form.setError('deathDate', {
          type: 'client',
          message: 'notification.validation.deathDateBeforeEventDate',
        });
        return;
      }
      const payload = buildNotificationPayload(values);
      try {
        if (notificationId) {
          await update.mutateAsync({ id: notificationId, data: payload });
          toast.success(t('common.toast.updated'));
        } else {
          const created = await create.mutateAsync({
            ...payload,
            caseId,
            notificationType,
          } as CreateNotificationInput);
          queryClient.setQueryData(notificationByCaseKey(caseId), created);
          toast.success(t('common.toast.created'));
        }
        // El `001`/`004` sella `notificationStartedAt` y avanza el workflow (SPEC FE12a §3.4
        // punto 4) — sin invalidar esto, el stepper seguiría mostrando el paso como no iniciado.
        await queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
        form.reset(values);
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
      }
    },
    [caseId, create, eventDate, form, notificationId, notificationType, queryClient, t, update],
  );

  const performSave = useCallback(() => form.handleSubmit(handleValidSubmit)(), [form, handleValidSubmit]);

  const pendingFields = computeHeaderPendingFields(watchedValues, isDeathOutcome, t);

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
  }, [registerStep, unregisterStep, form.formState.isDirty]);

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
              />
            )}
          />
        </div>
      </div>

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

  const readyToRenderForm =
    !!workflow.data &&
    !!esaviCase.data &&
    !!classification.data &&
    (!stageExists || !!notification.data);

  if (notification.isError) {
    const message =
      notification.error instanceof EsaviApiError
        ? getErrorMessage(notification.error)
        : t('common.errors.unexpected');
    return <p className="text-sm text-destructive">{message}</p>;
  }

  if (!readyToRenderForm) {
    return <NotificationStepSkeleton />;
  }

  const notificationType = classification.data?.isSeriousEvent ? 'SEVERE' : 'NON_SEVERE';

  return (
    <NotificationFormBody
      caseId={caseId}
      notification={notification.data ?? null}
      notificationType={notificationType}
      eventDate={esaviCase.data?.eventDate ?? null}
    />
  );
}
