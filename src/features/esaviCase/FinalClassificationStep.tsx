import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FinalClassificationDetail } from '@/contracts/declared/finalClassification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { useFinalClassificationByCase } from '@/features/finalClassification/api';
import { ImportanceSelect } from '@/features/finalClassification/ImportanceSelect';
import {
  IMPORTANCE_FIELDS,
  UNCLASSIFIABLE_FORBIDDEN_FIELDS,
  finalClassificationSaveSchema,
  toFormValues,
  type FinalClassificationFormValues,
} from '@/features/finalClassification/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

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

interface FinalClassificationFormBodyProps {
  finalClassification: FinalClassificationDetail | null;
  disabled?: boolean;
}

// El formulario en sí (SPEC FE14a §3.5): un único `useForm`, sin revelado progresivo y sin botón
// por sección — se guarda entero desde `CaseWizardActionBar` (paso 8 de este mismo plan).
function FinalClassificationFormBody({
  finalClassification,
  disabled,
}: FinalClassificationFormBodyProps) {
  const { t } = useTranslation();

  // Qué bloque se quedó con la posición de cuál otro (SPEC FE14a §3.5): efímero, no forma parte
  // del contrato de estado de §3.4. Como máximo una entrada a la vez — elegir una posición sólo
  // puede desplazar al bloque que la tenía antes.
  const [releasedNotices, setReleasedNotices] = useState<Partial<Record<ImportanceBlock, ImportanceBlock>>>(
    {},
  );

  const form = useForm<FinalClassificationFormValues>({
    resolver: zodResolver(finalClassificationSaveSchema) as Resolver<FinalClassificationFormValues>,
    defaultValues: buildDefaultValues(finalClassification),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as FinalClassificationFormValues;
  const blocksHidden = watchedValues.dIsUnclassifiable === true;

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

  return (
    <div className="flex flex-col gap-6">
      {!blocksHidden && (
        <fieldset
          disabled={disabled}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <legend className="px-1 text-sm font-medium text-foreground">
            {t('finalClassification.blockA.legend')}
          </legend>
          <ImportanceSelect
            label={t('finalClassification.blockA.importance')}
            value={watchedValues.importanceAItemId ?? null}
            onChange={(next) => handleImportanceChange('importanceAItemId', next)}
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
          <ImportanceSelect
            label={t('finalClassification.blockB.importance')}
            value={watchedValues.importanceBItemId ?? null}
            onChange={(next) => handleImportanceChange('importanceBItemId', next)}
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
          <ImportanceSelect
            label={t('finalClassification.blockC.importance')}
            value={watchedValues.importanceCItemId ?? null}
            onChange={(next) => handleImportanceChange('importanceCItemId', next)}
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
          render={({ field }) => (
            <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
              <Switch
                checked={field.value === true}
                onCheckedChange={(checked) => handleUnclassifiableChange(checked)}
                disabled={disabled}
                aria-label={t('finalClassification.fields.dIsUnclassifiable')}
              />
              {t('finalClassification.fields.dIsUnclassifiable')}
            </label>
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
      finalClassification={finalClassification.data ?? null}
      disabled={isClosed}
    />
  );
}
