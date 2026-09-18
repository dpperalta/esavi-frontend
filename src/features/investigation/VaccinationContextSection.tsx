import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationVaccinationContextDetail } from '@/contracts/declared/investigationVaccinationContext';
import {
  investigationVaccinationContextByCaseKey,
  investigationVaccinationContextResource,
} from '@/features/investigation/api';
import {
  buildVaccinationContextSavePayload,
  investigationVaccinationContextErrorFieldMap,
  investigationVaccinationContextSaveSchema,
  isClusterBlockOpen,
  isSameVialCountRequirementMet,
  type InvestigationSectionHandle,
  type InvestigationVaccinationContextFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { NumberField } from '@/shared/components/NumberField';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';

const SMALLINT_MAX = 32767;

function buildDefaultValues(
  vaccinationContext: InvestigationVaccinationContextDetail | null,
): InvestigationVaccinationContextFormValues {
  return {
    momentItemId: vaccinationContext?.momentItemId ?? null,
    multidoseItemId: vaccinationContext?.multidoseItemId ?? null,
    vaccinatedPerVialCount: vaccinationContext?.vaccinatedPerVialCount ?? null,
    vaccinatedPerBatchCount: vaccinationContext?.vaccinatedPerBatchCount ?? null,
    locations: vaccinationContext?.locations ?? null,
    isCluster: vaccinationContext?.isCluster ?? null,
    clusterIdentificationNumber: vaccinationContext?.clusterIdentificationNumber ?? null,
    clusterAdditionalCaseCount: vaccinationContext?.clusterAdditionalCaseCount ?? null,
    clusterUsedSameVial: vaccinationContext?.clusterUsedSameVial ?? null,
    clusterSameVialCount: vaccinationContext?.clusterSameVialCount ?? null,
    notes: vaccinationContext?.notes ?? null,
  };
}

export interface VaccinationContextSectionProps {
  caseId: string;
  investigationId: string;
  vaccinationContext: InvestigationVaccinationContextDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: InvestigationVaccinationContextFormValues;
  onValuesChange?: (values: InvestigationVaccinationContextFormValues) => void;
  onRegisterHandle?: (handle: InvestigationSectionHandle | null) => void;
}

// Sección D — contexto de vacunación (D.3–D.6) y D1 — conglomerado (SPEC FE13d §3.5, §4 paso 8).
// La ficha nace vacía al revelarse la sección, mismo patrón que `MedicalHistorySection`: un
// `POST { investigationId }` a secas y, desde ahí, todo guardado es `004` (§2, §6 decision 5).
export function VaccinationContextSection({
  caseId,
  investigationId,
  vaccinationContext,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
  onRegisterHandle,
}: VaccinationContextSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationVaccinationContextResource.useCreate();
  const update = investigationVaccinationContextResource.useUpdate();

  // Guarda contra un segundo intento del `POST` de apertura — doble efecto de StrictMode en dev,
  // o un re-render con la mutación todavía en vuelo — mismo patrón que `MedicalHistorySection`.
  const attemptedRef = useRef(false);

  function openVaccinationContext() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          // La fila 1:1 ya existe (carrera entre dos pestañas sobre el mismo caso): se relee en
          // vez de reintentar el `POST`, y no es un error del investigador.
          if (err instanceof EsaviApiError && err.code === 'INVVACTX_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationVaccinationContextByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (vaccinationContext !== null || attemptedRef.current) return;
    openVaccinationContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaccinationContext]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openVaccinationContext();
  }

  const form = useForm<InvestigationVaccinationContextFormValues>({
    resolver: zodResolver(
      investigationVaccinationContextSaveSchema,
    ) as Resolver<InvestigationVaccinationContextFormValues>,
    defaultValues: { ...buildDefaultValues(vaccinationContext), ...draftValues },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({
    control: form.control,
  }) as InvestigationVaccinationContextFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const isCluster = form.watch('isCluster');
  const clusterBlockOpen = isClusterBlockOpen(isCluster);
  const clusterUsedSameVial = form.watch('clusterUsedSameVial');
  const clusterSameVialCount = form.watch('clusterSameVialCount');
  // Predicado calculado a mano, no `form.formState.errors` (mismo criterio que
  // `otherDescriptionRequired` en `SourceSection`): el `superRefine` del schema sólo bloquea el
  // envío, el texto visible sale de la misma función pura con su propia clave i18n.
  const sameVialCountCoherent = isSameVialCountRequirementMet(
    clusterUsedSameVial,
    clusterSameVialCount,
  );

  async function handleValidSubmit(values: InvestigationVaccinationContextFormValues) {
    const payload = buildVaccinationContextSavePayload(values);
    try {
      await update.mutateAsync({ id: investigationId, data: payload });
      toast.success(t('common.toast.updated'));
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      const field = investigationVaccinationContextErrorFieldMap[err.code];
      if (field) {
        form.setError(field, { type: 'server', message: err.message });
        return;
      }
      toast.error(getErrorMessage(err));
    }
  }

  const performSaveRef = useRef(() => form.handleSubmit(handleValidSubmit)());
  performSaveRef.current = () => form.handleSubmit(handleValidSubmit)();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (vaccinationContext === null) {
      onRegisterHandle?.(null);
      return;
    }
    onRegisterHandle?.({ save: () => performSaveRef.current(), isDirty });
    return () => onRegisterHandle?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterHandle, isDirty, vaccinationContext === null]);

  // La fila todavía no existe, o el `POST` de apertura falló del todo (§3.6): no hay formulario
  // que pintar sobre una ficha que no se puede guardar. `INVVACTX_001_ALREADY_EXISTS` nunca llega
  // aquí — resetea la mutación y relee en vez de mostrarse como error.
  if (vaccinationContext === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError ? getErrorMessage(create.error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {t('investigation.vaccinationContext.openFailed')}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const isDisabled = disabled || vaccinationContext === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.vaccinationContext.title')}
      </h3>

      <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
        <legend className="sr-only">{t('investigation.vaccinationContext.title')}</legend>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="vaccinationContext-vaccinatedPerVialCount"
            className="text-sm font-medium text-foreground"
          >
            {t('investigation.vaccinationContext.field.vaccinatedPerVialCount')}
          </label>
          <Controller
            control={form.control}
            name="vaccinatedPerVialCount"
            render={({ field }) => (
              <NumberField
                id="vaccinationContext-vaccinatedPerVialCount"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.vaccinationContext.field.vaccinatedPerVialCount')}
                min={0}
                max={SMALLINT_MAX}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        {/* Etiqueta propia, paralela a la del vial (§6 decision 2) — no está en `ESAVI-FORM.md`. */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="vaccinationContext-vaccinatedPerBatchCount"
            className="text-sm font-medium text-foreground"
          >
            {t('investigation.vaccinationContext.field.vaccinatedPerBatchCount')}
          </label>
          <Controller
            control={form.control}
            name="vaccinatedPerBatchCount"
            render={({ field }) => (
              <NumberField
                id="vaccinationContext-vaccinatedPerBatchCount"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.vaccinationContext.field.vaccinatedPerBatchCount')}
                min={0}
                max={SMALLINT_MAX}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="locations"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vaccinationContext-locations" className="text-sm font-medium text-foreground">
                {t('investigation.vaccinationContext.field.locations')}
              </label>
              <Textarea
                id="vaccinationContext-locations"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />

        {/* Dos desplegables del MISMO catálogo, con `aria-label` distintos — un lector de pantalla
          no puede confundirlos (§3.7). */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.vaccinationContext.field.moment')}
          </span>
          <Controller
            control={form.control}
            name="momentItemId"
            render={({ field }) => (
              <CatalogSelect
                typeCode="vaccinationMoment"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.vaccinationContext.field.moment')}
                disabled={isDisabled}
              />
            )}
          />
          {form.formState.errors.momentItemId && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.momentItemId.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.vaccinationContext.field.multidose')}
          </span>
          <Controller
            control={form.control}
            name="multidoseItemId"
            render={({ field }) => (
              <CatalogSelect
                typeCode="vaccinationMoment"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.vaccinationContext.field.multidose')}
                disabled={isDisabled}
              />
            )}
          />
          {form.formState.errors.multidoseItemId && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.multidoseItemId.message}
            </p>
          )}
        </div>

        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vaccinationContext-notes" className="text-sm font-medium text-foreground">
                {t('investigation.vaccinationContext.field.notes')}
              </label>
              <Textarea
                id="vaccinationContext-notes"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />
      </fieldset>

      {/* D1 — Conglomerados (SPEC FE13d §3.5). `isCluster` es la compuerta, `'YES'` estricto. */}
      <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
        <legend className="text-sm font-medium text-foreground">
          {t('investigation.cluster.title')}
        </legend>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.cluster.field.isCluster')}
          </span>
          <Controller
            control={form.control}
            name="isCluster"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.cluster.field.isCluster')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <div aria-live="polite">
          {clusterBlockOpen && (
            <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
              <legend className="sr-only">{t('investigation.cluster.title')}</legend>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cluster-identificationNumber"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.cluster.field.identificationNumber')}
                </label>
                <Controller
                  control={form.control}
                  name="clusterIdentificationNumber"
                  render={({ field }) => (
                    <Input
                      id="cluster-identificationNumber"
                      maxLength={100}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                      disabled={isDisabled}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cluster-additionalCaseCount"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.cluster.field.additionalCaseCount')}
                </label>
                <Controller
                  control={form.control}
                  name="clusterAdditionalCaseCount"
                  render={({ field }) => (
                    <NumberField
                      id="cluster-additionalCaseCount"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.cluster.field.additionalCaseCount')}
                      min={0}
                      max={SMALLINT_MAX}
                      disabled={isDisabled}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.cluster.field.usedSameVial')}
                </span>
                <Controller
                  control={form.control}
                  name="clusterUsedSameVial"
                  render={({ field }) => (
                    <AnswerOptionField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.cluster.field.usedSameVial')}
                      disabled={isDisabled}
                    />
                  )}
                />
              </div>

              {/* La regla del vial: el 'NO' exige el contador, el 'YES' no (§1.A, §6 decision 3). */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cluster-sameVialCount" className="text-sm font-medium text-foreground">
                  {t('investigation.cluster.field.sameVialCount')}
                </label>
                <Controller
                  control={form.control}
                  name="clusterSameVialCount"
                  render={({ field }) => (
                    <NumberField
                      id="cluster-sameVialCount"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.cluster.field.sameVialCount')}
                      min={0}
                      max={SMALLINT_MAX}
                      disabled={isDisabled}
                    />
                  )}
                />
                {!sameVialCountCoherent && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('investigation.cluster.sameVialCountRequired')}
                  </p>
                )}
              </div>
            </fieldset>
          )}
        </div>
      </fieldset>

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={isDisabled || update.isPending}
          onClick={() => void form.handleSubmit(handleValidSubmit)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
