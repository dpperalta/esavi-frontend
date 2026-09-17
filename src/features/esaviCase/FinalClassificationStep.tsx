import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateFinalClassificationInput } from '@/contracts/finalClassification';
import type { FinalClassificationDetail } from '@/contracts/declared/finalClassification';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import {
  finalClassificationByCaseKey,
  finalClassificationResource,
  useCreateFinalClassification,
  useFinalClassificationByCase,
} from '@/features/finalClassification/api';
import { ImportanceSelect } from '@/features/finalClassification/ImportanceSelect';
import {
  IMPORTANCE_FIELDS,
  UNCLASSIFIABLE_FORBIDDEN_FIELDS,
  finalClassificationSaveSchema,
  hasVerdict,
  toFormValues,
  type FinalClassificationFormValues,
} from '@/features/finalClassification/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { resolveDraftConflict, useDraftsStore } from '@/shared/stores/draftsStore';
import { useCaseWizard } from './CaseWizardContext';

type ImportanceField = (typeof IMPORTANCE_FIELDS)[number];
type ImportanceBlock = 'A' | 'B' | 'C';

const IMPORTANCE_FIELD_BLOCK: Record<ImportanceField, ImportanceBlock> = {
  importanceAItemId: 'A',
  importanceBItemId: 'B',
  importanceCItemId: 'C',
};

// A1–A4, B1–B2 y C, en el orden de `ESAVI-FORM.md` (SPEC FE14a §2, §3.8). Cada arreglo es un
// bloque distinto porque cada uno vive bajo su propio `<fieldset>`.
const BLOCK_A_SWITCHES = [
  { name: 'aIsRelatedToVaccineProduct', labelKey: 'finalClassification.fields.aIsRelatedToVaccineProduct' },
  { name: 'aIsRelatedToQualityDeviation', labelKey: 'finalClassification.fields.aIsRelatedToQualityDeviation' },
  { name: 'aIsRelatedToProgrammaticError', labelKey: 'finalClassification.fields.aIsRelatedToProgrammaticError' },
  { name: 'aIsRelatedToStress', labelKey: 'finalClassification.fields.aIsRelatedToStress' },
] as const satisfies ReadonlyArray<{ name: keyof FinalClassificationFormValues; labelKey: string }>;

const BLOCK_B_SWITCHES = [
  { name: 'bIsConsistentTemporalRelation', labelKey: 'finalClassification.fields.bIsConsistentTemporalRelation' },
  { name: 'bHasDeterminantFactor', labelKey: 'finalClassification.fields.bHasDeterminantFactor' },
] as const satisfies ReadonlyArray<{ name: keyof FinalClassificationFormValues; labelKey: string }>;

const BLOCK_C_SWITCHES = [
  { name: 'cHasCoincidentCause', labelKey: 'finalClassification.fields.cHasCoincidentCause' },
] as const satisfies ReadonlyArray<{ name: keyof FinalClassificationFormValues; labelKey: string }>;

function buildDefaultValues(detail: FinalClassificationDetail | null): FinalClassificationFormValues {
  if (!detail) {
    return {
      importanceAItemId: null,
      aIsRelatedToVaccineProduct: null,
      aIsRelatedToQualityDeviation: null,
      aIsRelatedToProgrammaticError: null,
      aIsRelatedToStress: null,
      importanceBItemId: null,
      bIsConsistentTemporalRelation: null,
      bHasDeterminantFactor: null,
      importanceCItemId: null,
      cHasCoincidentCause: null,
      dIsUnclassifiable: null,
      notes: null,
    };
  }
  return toFormValues(detail);
}

function FinalClassificationStepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

interface SwitchRowProps {
  control: ReturnType<typeof useForm<FinalClassificationFormValues>>['control'];
  name: keyof FinalClassificationFormValues;
  labelKey: string;
  disabled?: boolean;
}

// El mismo `<Switch>` tri-estado de FE13a (SPEC FE14a §1E, §6): nace en `null` y sólo escribe
// `false` si se apaga a mano — nunca vuelve a `null` una vez tocado.
function SwitchRow({ control, name, labelKey, disabled }: SwitchRowProps) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
          <Switch
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked)}
            disabled={disabled}
            aria-label={t(labelKey)}
          />
          {t(labelKey)}
        </label>
      )}
    />
  );
}

interface ImportanceFieldRowProps {
  control: ReturnType<typeof useForm<FinalClassificationFormValues>>['control'];
  name: ImportanceField;
  label: string;
  value: string | null;
  onChangeValue: (value: string | null) => void;
  releasedToBlock: ImportanceBlock | null;
  disabled?: boolean;
}

// El `<ImportanceSelect>` más su error de servidor (`_IMPORTANCE_DUPLICATED`/`_IMPORTANCE_NOT_FOUND`,
// SPEC FE14a §3.5), anclado en el campo y no en un aviso genérico. Envuelto en `Controller` sólo
// para leer `fieldState.error` — el valor y el `onChange` siguen viniendo de `handleImportanceChange`.
function ImportanceFieldRow({
  control,
  name,
  label,
  value,
  onChangeValue,
  releasedToBlock,
  disabled,
}: ImportanceFieldRowProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ fieldState }) => (
        <div className="flex flex-col gap-1">
          <ImportanceSelect
            label={label}
            value={value}
            onChange={onChangeValue}
            releasedToBlock={releasedToBlock}
            disabled={disabled}
          />
          {fieldState.error && (
            <p role="alert" className="text-sm text-destructive">
              {fieldState.error.message}
            </p>
          )}
        </div>
      )}
    />
  );
}

// «Completar etapa» exige un veredicto (SPEC FE14a §3.5): `dIsUnclassifiable === true`, o al
// menos uno de los siete booleanos de A, B y C en `true`. Sin veredicto, la barra lo lista como
// pendiente en vez de apagar el botón en silencio.
function computePendingFields(
  values: FinalClassificationFormValues,
  t: (key: string) => string,
): string[] {
  return hasVerdict(values) ? [] : [t('finalClassification.pending.verdict')];
}

interface FinalClassificationFormBodyProps {
  caseId: string;
  finalClassification: FinalClassificationDetail | null;
  disabled?: boolean;
}

// El formulario en sí (SPEC FE14a §3.5): un único `useForm`, sin revelado progresivo y sin botón
// por sección — se guarda entero desde `CaseWizardActionBar`, con el handle registrado más abajo.
function FinalClassificationFormBody({
  caseId,
  finalClassification,
  disabled,
}: FinalClassificationFormBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { registerStep, unregisterStep } = useCaseWizard();
  const create = useCreateFinalClassification();
  const update = finalClassificationResource.useUpdate();

  // Nunca en `useState` (mismo criterio que `ClassificationStep`): `finalClassification` ya es la
  // caché de TanStack Query, así que el id se deriva del prop en cada render en vez de copiarse.
  const finalClassificationId = finalClassification?.finalClassificationId ?? null;

  // El `updatedAt` de la fila al montar (SPEC FE14a §3.4, mismo criterio que `InvestigationStep`):
  // nunca se recalcula, o la regla de conflicto se compararía siempre contra sí misma.
  const baseUpdatedAtRef = useRef(finalClassification?.updatedAt ?? null);

  // Resuelto una sola vez, en el primer render de este cuerpo — que sólo se monta con la lectura
  // del `006` ya resuelta (o `exists === false`), igual que `InvestigationStep`.
  const [draft] = useState(() => {
    const stored = useDraftsStore.getState().get(caseId, 'finalClassification');
    const resolution = resolveDraftConflict(stored, baseUpdatedAtRef.current);
    return {
      resolution,
      values: (stored?.values as Partial<FinalClassificationFormValues> | undefined) ?? {},
    };
  });

  const hasNotifiedDraftRef = useRef(false);
  useEffect(() => {
    if (hasNotifiedDraftRef.current) return;
    hasNotifiedDraftRef.current = true;
    if (draft.resolution === 'discard') {
      useDraftsStore.getState().clear(caseId, 'finalClassification');
      toast.info(t('finalClassification.draft.discarded'));
    } else if (draft.resolution === 'restore') {
      toast.info(t('finalClassification.draft.restored'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Qué bloque se quedó con la posición de cuál otro (SPEC FE14a §3.5): efímero, no forma parte
  // del contrato de estado de §3.4. Como máximo una entrada a la vez — elegir una posición sólo
  // puede desplazar al bloque que la tenía antes.
  const [releasedNotices, setReleasedNotices] = useState<Partial<Record<ImportanceBlock, ImportanceBlock>>>(
    {},
  );

  const form = useForm<FinalClassificationFormValues>({
    resolver: zodResolver(finalClassificationSaveSchema) as Resolver<FinalClassificationFormValues>,
    defaultValues: {
      ...buildDefaultValues(finalClassification),
      ...(draft.resolution === 'restore' ? draft.values : {}),
    },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as FinalClassificationFormValues;
  const blocksHidden = watchedValues.dIsUnclassifiable === true;

  // Un único debounce de 500ms para todo el formulario (SPEC FE14a §2, §3.4, mismo criterio que
  // `InvestigationStep`): cualquier cambio reinicia el mismo temporizador.
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Sólo si el formulario está sucio (SPEC FE14a §3.4): `form.reset(values)` deja `isDirty` en
    // `false` justo después de guardar, y eso es lo que impide que este mismo efecto — que se
    // vuelve a ejecutar porque `watchedValues` cambia de referencia en cada render — resucite el
    // borrador que `clearDraft()` acaba de borrar.
    if (!form.formState.isDirty) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      useDraftsStore.getState().set(caseId, 'finalClassification', watchedValues, baseUpdatedAtRef.current);
    }, 500);
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, [caseId, watchedValues, form.formState.isDirty]);

  // "Se borra en cuanto responde el POST o el PUT" (§2, §3.4): lo ya escrito está en la base, y lo
  // que queda sin tocar no necesita sobrevivir a un cierre accidental sobre un dato que ya es
  // historia.
  function clearDraft() {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    useDraftsStore.getState().clear(caseId, 'finalClassification');
  }

  // La precedencia, en el cliente (SPEC FE14a §3.5): elegir en un selector una posición que ya
  // tiene otro bloque deja ese otro en `null` y muestra el aviso bajo él. El formulario nunca
  // llega a tener dos importancias iguales.
  function handleImportanceChange(changedField: ImportanceField, nextValue: string | null) {
    form.setValue(changedField, nextValue, { shouldDirty: true, shouldValidate: true });
    const changedBlock = IMPORTANCE_FIELD_BLOCK[changedField];
    setReleasedNotices((prev) => {
      if (!(changedBlock in prev)) return prev;
      const next = { ...prev };
      delete next[changedBlock];
      return next;
    });
    if (!nextValue) return;
    for (const field of IMPORTANCE_FIELDS) {
      if (field === changedField) continue;
      if (form.getValues(field) === nextValue) {
        form.setValue(field, null, { shouldDirty: true, shouldValidate: true });
        setReleasedNotices((prev) => ({ ...prev, [IMPORTANCE_FIELD_BLOCK[field]]: changedBlock }));
      }
    }
  }

  // El bloque D, en el cliente (SPEC FE14a §3.5): encenderlo pone a `null` las diez columnas y las
  // oculta. Apagarlo NO restaura lo que había — misma dirección que el forzado del `004` server-side.
  function handleUnclassifiableChange(checked: boolean) {
    form.setValue('dIsUnclassifiable', checked, { shouldDirty: true, shouldValidate: true });
    if (checked) {
      for (const field of UNCLASSIFIABLE_FORBIDDEN_FIELDS) {
        form.setValue(field, null, { shouldDirty: true, shouldValidate: true });
      }
      setReleasedNotices({});
    }
  }

  const handleValidSubmit = useCallback(
    async (values: FinalClassificationFormValues) => {
      try {
        if (finalClassificationId) {
          await update.mutateAsync({ id: finalClassificationId, data: values });
          toast.success(t('common.toast.updated'));
        } else {
          const created = await create.mutateAsync({
            ...values,
            caseId,
          } as CreateFinalClassificationInput);
          queryClient.setQueryData(finalClassificationByCaseKey(caseId), created);
          toast.success(t('common.toast.created'));
        }
        form.reset(values);
        clearDraft();
      } catch (err) {
        if (!(err instanceof EsaviApiError)) {
          throw err;
        }
        // `CASEFLOW_012_CASE_CLOSED` conmuta el armazón a sólo lectura sin esperar el próximo
        // `006` de workflow (SPEC FE14a §3.5), mismo criterio que `ClassificationStep`.
        if (err.code === 'CASEFLOW_012_CASE_CLOSED') {
          queryClient.setQueryData<CaseWorkflowDetail>(['caseWorkflow', 'byCase', caseId], (old) =>
            old ? { ...old, status: { ...old.status, code: 'CLOSED' } } : old,
          );
          toast.error(getErrorMessage(err));
          return;
        }
        // El número de operación entre `FINCLASS` y el sufijo no está fijo (`00X`, SPEC FE14a
        // §3.5) — comparado por sufijo, mismo criterio que `BasicInfoSection` (FE13a).
        if (err.code.endsWith('_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED')) {
          form.setError('dIsUnclassifiable', { type: 'server', message: err.message });
          return;
        }
        if (err.code.endsWith('_IMPORTANCE_DUPLICATED')) {
          // El servidor no dice cuáles dos se repiten — ancla en todas las importancias con
          // valor, no sólo en el par real (SPEC FE14a §3.5).
          for (const field of IMPORTANCE_FIELDS) {
            if (form.getValues(field)) {
              form.setError(field, { type: 'server', message: err.message });
            }
          }
          return;
        }
        if (err.code.endsWith('_IMPORTANCE_NOT_FOUND')) {
          // El bloque va dentro de `err.message`, que no se parsea (SPEC FE14a §3.5) — ancla en
          // todas las importancias con valor e invalida el catálogo.
          for (const field of IMPORTANCE_FIELDS) {
            if (form.getValues(field)) {
              form.setError(field, { type: 'server', message: err.message });
            }
          }
          await queryClient.invalidateQueries({ queryKey: ['catalogItem'] });
          return;
        }
        // La carrera entre dos pestañas (SPEC FE14a §3.5): relee la fila y el siguiente «Guardar»
        // es un `PUT`, no un segundo `POST`.
        if (err.code === 'FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED') {
          await queryClient.invalidateQueries({ queryKey: finalClassificationByCaseKey(caseId) });
          await queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
          toast.error(getErrorMessage(err));
          return;
        }
        toast.error(getErrorMessage(err));
      }
    },
    [caseId, create, finalClassificationId, form, queryClient, t, update, clearDraft],
  );

  const performSave = useCallback(
    () => form.handleSubmit(handleValidSubmit)(),
    [form, handleValidSubmit],
  );

  const pendingFields = computePendingFields(watchedValues, t);

  // Leídos por referencia dentro del handle, nunca capturados por valor (mismo criterio que
  // `ClassificationStep`, SPEC FE11 §9): depender de `pendingFields`/`performSave` en el array de
  // dependencias reabre `CaseWizardProvider` en cada cambio y produce un bucle sin fin.
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
      <h2 className="text-lg font-semibold text-foreground">{t('finalClassification.title')}</h2>

      {!blocksHidden && (
        <fieldset
          disabled={disabled}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <legend className="px-1 text-sm font-medium text-foreground">
            {t('finalClassification.blockA.legend')}
          </legend>
          <ImportanceFieldRow
            control={form.control}
            name="importanceAItemId"
            label={t('finalClassification.blockA.importance')}
            value={watchedValues.importanceAItemId ?? null}
            onChangeValue={(next) => handleImportanceChange('importanceAItemId', next)}
            releasedToBlock={releasedNotices.A ?? null}
            disabled={disabled}
          />
          <p className="text-sm text-muted-foreground">{t('finalClassification.blockA.vaccineTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('finalClassification.blockA.processTitle')}</p>
          {BLOCK_A_SWITCHES.map(({ name, labelKey }) => (
            <SwitchRow key={name} control={form.control} name={name} labelKey={labelKey} disabled={disabled} />
          ))}
        </fieldset>
      )}

      {!blocksHidden && (
        <fieldset
          disabled={disabled}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <legend className="px-1 text-sm font-medium text-foreground">
            {t('finalClassification.blockB.legend')}
          </legend>
          <ImportanceFieldRow
            control={form.control}
            name="importanceBItemId"
            label={t('finalClassification.blockB.importance')}
            value={watchedValues.importanceBItemId ?? null}
            onChangeValue={(next) => handleImportanceChange('importanceBItemId', next)}
            releasedToBlock={releasedNotices.B ?? null}
            disabled={disabled}
          />
          <p className="text-sm text-muted-foreground">{t('finalClassification.blockB.title')}</p>
          {BLOCK_B_SWITCHES.map(({ name, labelKey }) => (
            <SwitchRow key={name} control={form.control} name={name} labelKey={labelKey} disabled={disabled} />
          ))}
        </fieldset>
      )}

      {!blocksHidden && (
        <fieldset
          disabled={disabled}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <legend className="px-1 text-sm font-medium text-foreground">
            {t('finalClassification.blockC.legend')}
          </legend>
          <ImportanceFieldRow
            control={form.control}
            name="importanceCItemId"
            label={t('finalClassification.blockC.importance')}
            value={watchedValues.importanceCItemId ?? null}
            onChangeValue={(next) => handleImportanceChange('importanceCItemId', next)}
            releasedToBlock={releasedNotices.C ?? null}
            disabled={disabled}
          />
          <p className="text-sm text-muted-foreground">{t('finalClassification.blockC.title')}</p>
          {BLOCK_C_SWITCHES.map(({ name, labelKey }) => (
            <SwitchRow key={name} control={form.control} name={name} labelKey={labelKey} disabled={disabled} />
          ))}
        </fieldset>
      )}

      <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium text-foreground">
          {t('finalClassification.blockD.legend')}
        </legend>
        <Controller
          control={form.control}
          name="dIsUnclassifiable"
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1">
              <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => handleUnclassifiableChange(checked)}
                  disabled={disabled}
                  aria-label={t('finalClassification.fields.dIsUnclassifiable')}
                />
                {t('finalClassification.fields.dIsUnclassifiable')}
              </label>
              {fieldState.error && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      </fieldset>

      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="finalClassification-notes" className="text-sm font-medium text-foreground">
              {t('finalClassification.fields.notes')}
            </label>
            <Textarea
              id="finalClassification-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={disabled}
            />
            {blocksHidden && (
              <p className="text-xs text-muted-foreground">
                {t('finalClassification.help.notesUnclassifiable')}
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
}

export interface FinalClassificationStepProps {
  caseId: string;
}

// Paso 6 del wizard (SPEC FE14a): el veredicto de causalidad. Reemplaza el placeholder `<div>`
// del slug `final-classification` en `CaseWizardPage`.
export function FinalClassificationStep({ caseId }: FinalClassificationStepProps) {
  const { t } = useTranslation();
  const workflow = useCaseWorkflow(caseId);
  const stageExists = workflow.data?.stages.finalClassification.exists === true;
  // El `006` sólo se llama en reentrada (SPEC FE14a §3.6, decisión de §1B): la fila nace con el
  // primer «Guardar», nunca al entrar al paso.
  const finalClassification = useFinalClassificationByCase(caseId, stageExists);

  if (!workflow.data) {
    return <FinalClassificationStepSkeleton />;
  }

  if (stageExists && finalClassification.isLoading) {
    return <FinalClassificationStepSkeleton />;
  }

  if (stageExists && finalClassification.isError) {
    const error = finalClassification.error;
    // Fila desactivada (SPEC FE14a §3.6): `exists === true` pero el `006` da 404. Un `POST` daría
    // `409` — el `UNIQUE` no mira `isActive` — así que no se pinta el formulario.
    if (error instanceof EsaviApiError && error.code === 'FINCLASS_006_NOT_FOUND') {
      return (
        <p role="status" className="text-sm text-muted-foreground">
          {t('finalClassification.error.inactive')}
        </p>
      );
    }
    const message =
      error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium text-foreground">{t('finalClassification.error.loadFailed')}</p>
        <p className="text-sm text-destructive">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void finalClassification.refetch()}
        >
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const isClosed = workflow.data.status.code === 'CLOSED';

  return (
    <FinalClassificationFormBody
      caseId={caseId}
      finalClassification={finalClassification.data ?? null}
      disabled={isClosed}
    />
  );
}
