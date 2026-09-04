import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation, type TFunction } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateClassificationInput } from '@/contracts/classification';
import type { ClassificationDetail } from '@/contracts/declared/classification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { classificationResource, useClassificationByCase } from '@/features/classification/api';
import {
  classificationSchema,
  hasAnySeriousCriterion,
  type ClassificationFormValues,
} from '@/features/classification/schemas';
import { patientResource } from '@/features/patient/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { Input } from '@/shared/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { esaviCaseResource } from './api';
import { useCaseWizard } from './CaseWizardContext';
import { SeverityCriteriaGroup } from './SeverityCriteriaGroup';

export interface ClassificationAgeFieldProps {
  // Ambas en `false` hasta que las dos queries de las que depende el modo (`esaviCase`, `patient`)
  // resuelven — nunca se calcula aquí adentro, para no arriesgar una segunda implementación de la
  // misma regla (SPEC FE11 §7, riesgo del parpadeo).
  readyToResolve: boolean;
  canCalculate: boolean;
  resolvedAge: number | null;
  resolvedAgeUnitName: string | null;
  age: number | null;
  onAgeChange: (value: number | null) => void;
  ageUnitItemId: string | null;
  onAgeUnitItemIdChange: (value: string | null) => void;
  disabled?: boolean;
}

// El campo edad (SPEC FE11 §3.5, decisión §6): texto de sólo lectura con el valor resuelto por el
// backend cuando `patient.birthDate` y `esaviCase.eventDate` existen los dos; `<Input
// type="number">` + `<CatalogSelect typeCode="ageUnit" emit="id">` en caso contrario. El modo lo
// decide quien monta este componente (`readyToResolve`/`canCalculate`) a partir de dos queries ya
// cacheadas — nunca un `useState` ni un cálculo propio aquí.
export function ClassificationAgeField({
  readyToResolve,
  canCalculate,
  resolvedAge,
  resolvedAgeUnitName,
  age,
  onAgeChange,
  ageUnitItemId,
  onAgeUnitItemIdChange,
  disabled,
}: ClassificationAgeFieldProps) {
  const { t } = useTranslation();
  const noteId = useId();

  // Mientras las dos queries no resolvieron, el skeleton — nunca el modo editable como valor por
  // defecto (SPEC FE11 §3.6, §7): mostrar `<Input>` primero y ocultarlo después es peor que
  // esperar.
  if (!readyToResolve) {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-xs" />
      </div>
    );
  }

  if (canCalculate) {
    return (
      <div className="flex flex-col gap-1.5">
        <p aria-describedby={noteId} className="text-sm text-foreground">
          {resolvedAge !== null ? `${resolvedAge} ${resolvedAgeUnitName ?? ''}`.trim() : '—'}
        </p>
        {/* Asociado con `aria-describedby`, no sólo colocado al lado (SPEC FE11 §3.7). */}
        <p id={noteId} className="text-sm text-muted-foreground">
          {t('classification.age.calculatedNote')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('classification.age.label')}</span>
        <Input
          type="number"
          min={0}
          max={32767}
          value={age ?? ''}
          onChange={(event) =>
            onAgeChange(event.target.value === '' ? null : Number(event.target.value))
          }
          disabled={disabled}
          aria-label={t('classification.age.label')}
          className="w-full max-w-32"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('classification.age.unitLabel')}
        </span>
        <CatalogSelect
          typeCode="ageUnit"
          emit="id"
          value={ageUnitItemId}
          onChange={onAgeUnitItemIdChange}
          ariaLabel={t('classification.age.unitLabel')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ClassificationStepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-9 w-full max-w-sm" />
    </div>
  );
}

// `age`/`ageUnitItemId` no viajan en el cuerpo cuando el modo es de sólo lectura (SPEC FE11 §3.5):
// el backend los ignora igual, pero no tiene sentido enviar un valor que el formulario ni pintó.
function buildClassificationPayload(
  values: ClassificationFormValues,
  canCalculateAge: boolean,
): Partial<CreateClassificationInput> {
  const { age, ageUnitItemId, ...rest } = values;
  return canCalculateAge ? rest : { ...rest, age, ageUnitItemId };
}

// Réplica en lenguaje de usuario de la misma matriz de coherencia de `classificationSchema`
// (SPEC FE11 §3.5): lo que `CaseWizardActionBar` pinta como "campos pendientes" antes de que el
// usuario intente guardar.
function computePendingFields(values: ClassificationFormValues, t: TFunction): string[] {
  const pending: string[] = [];
  if (values.isSeriousEvent === undefined || values.isSeriousEvent === null) {
    pending.push(t('classification.gate.label'));
  } else if (values.isSeriousEvent === true && !hasAnySeriousCriterion(values)) {
    pending.push(t('classification.criteria.atLeastOneRequired'));
  }
  if (
    values.causedOtherCondition === true &&
    !String(values.otherSeriousConditionDescription ?? '').trim()
  ) {
    pending.push(t('classification.otherCondition.description'));
  }
  return pending;
}

interface ClassificationFormBodyProps {
  caseId: string;
  classification: ClassificationDetail | null;
  readyToResolveAge: boolean;
  canCalculateAge: boolean;
}

// El formulario en sí (SPEC FE11 §3.1, §3.4): sólo se monta una vez que `ClassificationStep`
// resolvió workflow + caso + paciente + (si aplica) la clasificación existente, así que
// `defaultValues` nace correcto en el primer render y no hace falta un `reset()` reactivo — mismo
// patrón que el `readyToRender` de `CaseOpeningStep`.
function ClassificationFormBody({
  caseId,
  classification,
  readyToResolveAge,
  canCalculateAge,
}: ClassificationFormBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { registerStep, unregisterStep } = useCaseWizard();
  const create = classificationResource.useCreate();
  const update = classificationResource.useUpdate();

  // Semilla desde la fila existente (reentrada); se sustituye por el id que devuelve el primer
  // `POST` exitoso de esta misma sesión, sin esperar a que `stages.classification.exists` se
  // actualice desde fuera (SPEC FE11 §3.4).
  const [classificationId, setClassificationId] = useState<string | null>(
    classification?.classificationId ?? null,
  );

  const defaultValues: ClassificationFormValues = {
    isSeriousEvent: classification?.isSeriousEvent ?? undefined,
    causedDeath: classification?.causedDeath ?? null,
    causedDisability: classification?.causedDisability ?? null,
    causedCongenitalAnomaly: classification?.causedCongenitalAnomaly ?? null,
    causedFetalDeath: classification?.causedFetalDeath ?? null,
    causedLifeThreatening: classification?.causedLifeThreatening ?? null,
    causedHospitalization: classification?.causedHospitalization ?? null,
    causedAbortion: classification?.causedAbortion ?? null,
    causedOtherCondition: classification?.causedOtherCondition ?? null,
    otherSeriousConditionDescription: classification?.otherSeriousConditionDescription ?? null,
    age: classification?.age ?? null,
    ageUnitItemId: classification?.ageUnit?.catalogItemId ?? null,
    firstConsultationDate: classification?.firstConsultationDate ?? null,
  };

  const form = useForm<ClassificationFormValues>({
    resolver: zodResolver(classificationSchema) as Resolver<ClassificationFormValues>,
    defaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as ClassificationFormValues;

  const handleValidSubmit = useCallback(
    async (values: ClassificationFormValues) => {
      const payload = buildClassificationPayload(values, canCalculateAge);
      try {
        if (classificationId) {
          await update.mutateAsync({ id: classificationId, data: payload });
          toast.success(t('common.toast.updated'));
        } else {
          const created = await create.mutateAsync({
            ...payload,
            caseId,
          } as CreateClassificationInput);
          setClassificationId(created.classificationId);
          toast.success(t('common.toast.created'));
        }
        // El `POST`/`PUT` avanza `CLASSIFICATION` en el workflow (SPEC FE11 §1C, §3.2) — sin
        // invalidar esto, el stepper seguiría mostrando el paso como no iniciado (SPEC FE11 §3.4).
        await queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
        form.reset(values);
      } catch (err) {
        if (err instanceof EsaviApiError) {
          toast.error(getErrorMessage(err));
          return;
        }
        throw err;
      }
    },
    [caseId, canCalculateAge, classificationId, create, form, queryClient, t, update],
  );

  const performSave = useCallback(
    () => form.handleSubmit(handleValidSubmit)(),
    [form, handleValidSubmit],
  );

  const pendingFields = useMemo(
    () => computePendingFields(watchedValues, t),
    [watchedValues, t],
  );

  // `activeStep` es un objeto plano en el contexto (SPEC FE08 §3.5): un handle nuevo en cada
  // cambio relevante es lo que hace que `CaseWizardActionBar` vuelva a leer `isDirty` y
  // `pendingFields` al vuelo, sin que el propio botón "Guardar" dependa de ninguno de los dos.
  useEffect(() => {
    registerStep({
      save: performSave,
      isDirty: form.formState.isDirty,
      getPendingFields: () => pendingFields,
    });
    return () => unregisterStep();
  }, [registerStep, unregisterStep, performSave, form.formState.isDirty, pendingFields]);

  const criteriaError = (
    form.formState.errors as Record<string, { message?: string } | undefined>
  ).criteria;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('classification.gate.label')}</span>
        <Controller
          control={form.control}
          name="isSeriousEvent"
          render={({ field, fieldState }) => (
            <>
              <RadioGroup
                aria-label={t('classification.gate.label')}
                value={field.value === true ? 'true' : field.value === false ? 'false' : undefined}
                onValueChange={(next) => field.onChange(next === 'true')}
                className="flex w-auto gap-4"
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <RadioGroupItem value="true" />
                  {t('classification.gate.yes')}
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <RadioGroupItem value="false" />
                  {t('classification.gate.no')}
                </label>
              </RadioGroup>
              {fieldState.error && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </>
          )}
        />
      </div>

      {watchedValues.isSeriousEvent === true && (
        <SeverityCriteriaGroup control={form.control} hasGroupError={!!criteriaError} />
      )}

      {watchedValues.causedOtherCondition === true && (
        <Controller
          control={form.control}
          name="otherSeriousConditionDescription"
          render={({ field, fieldState }) => (
            <div aria-live="polite" className="flex flex-col gap-1.5">
              <label
                htmlFor="classification-otherDescription"
                className="text-sm font-medium text-foreground"
              >
                {t('classification.otherCondition.description')}
              </label>
              <Textarea
                id="classification-otherDescription"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
              />
              {fieldState.error && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldState.error.message === 'otherConditionDescriptionRequired'
                    ? t('classification.otherCondition.descriptionRequired')
                    : fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      )}

      <ClassificationAgeField
        readyToResolve={readyToResolveAge}
        canCalculate={canCalculateAge}
        resolvedAge={classification?.age ?? null}
        resolvedAgeUnitName={classification?.ageUnit?.name ?? null}
        age={watchedValues.age ?? null}
        onAgeChange={(value) => form.setValue('age', value, { shouldDirty: true, shouldValidate: true })}
        ageUnitItemId={watchedValues.ageUnitItemId ?? null}
        onAgeUnitItemIdChange={(value) =>
          form.setValue('ageUnitItemId', value, { shouldDirty: true, shouldValidate: true })
        }
      />

      <Controller
        control={form.control}
        name="firstConsultationDate"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('classification.firstConsultationDate.label')}
            </span>
            <DateField
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('classification.firstConsultationDate.label')}
              allowFuture={false}
            />
          </div>
        )}
      />
    </div>
  );
}

export interface ClassificationStepProps {
  caseId: string;
}

// Paso 3 del wizard (SPEC FE11): la clasificación inicial de gravedad. Reemplaza el placeholder
// `<div>` del slug `classification` en el `<Outlet>` de `CaseWizardPage` (FE08, paso 9).
export function ClassificationStep({ caseId }: ClassificationStepProps) {
  const workflow = useCaseWorkflow(caseId);
  const esaviCase = esaviCaseResource.useOne(caseId);
  const patientId = esaviCase.data?.patient.patientId;
  const patient = patientResource.useOne(patientId ?? '');

  const stageExists = workflow.data?.stages.classification.exists === true;
  // `006` sólo se llama en reentrada (SPEC FE11 §3.2, decisión §6): evita un `404
  // CLASSIF_006_NOT_FOUND` que nunca debería leerse como error.
  const classification = useClassificationByCase(caseId, stageExists);

  const readyToResolveAge = !!esaviCase.data && (!!patient.data || patient.isError);
  const canCalculateAge =
    readyToResolveAge && !!patient.data?.birthDate && !!esaviCase.data?.eventDate;

  const readyToRenderForm =
    !!workflow.data &&
    !!esaviCase.data &&
    (!stageExists || !!classification.data) &&
    readyToResolveAge;

  if (!readyToRenderForm) {
    return <ClassificationStepSkeleton />;
  }

  return (
    <ClassificationFormBody
      caseId={caseId}
      classification={classification.data ?? null}
      readyToResolveAge={readyToResolveAge}
      canCalculateAge={canCalculateAge}
    />
  );
}
