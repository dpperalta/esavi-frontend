import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AnswerOption } from '@/contracts/common';
import type { InvestigationAdministrationErrorDetail } from '@/contracts/declared/investigationAdministrationError';
import {
  investigationAdministrationErrorByCaseKey,
  investigationAdministrationErrorResource,
} from '@/features/investigation/api';
import {
  buildAdministrationErrorSavePayload,
  investigationAdministrationErrorSaveSchema,
  isSyringeBlockOpen,
  type InvestigationAdministrationErrorFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Button } from '@/shared/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(
  administrationError: InvestigationAdministrationErrorDetail | null,
): InvestigationAdministrationErrorFormValues {
  return {
    usedAutoDisableSyringes: administrationError?.usedAutoDisableSyringes ?? null,
    usedGlassSyringes: administrationError?.usedGlassSyringes ?? null,
    usedDisposableSyringes: administrationError?.usedDisposableSyringes ?? null,
    usedRecycledDisposableSyringes: administrationError?.usedRecycledDisposableSyringes ?? null,
    usedOtherSyringes: administrationError?.usedOtherSyringes ?? null,
    otherSyringesDescription: administrationError?.otherSyringesDescription ?? null,
    syringesKeyFindings: administrationError?.syringesKeyFindings ?? null,
    reconstitutionUsedSameSyringe: administrationError?.reconstitutionUsedSameSyringe ?? null,
    reconstitutionUsedSameSyringeDifferentVaccine:
      administrationError?.reconstitutionUsedSameSyringeDifferentVaccine ?? null,
    reconstitutionUsedDifferentSyringeSameVial:
      administrationError?.reconstitutionUsedDifferentSyringeSameVial ?? null,
    reconstitutionUsedDifferentSyringeDifferentVaccine:
      administrationError?.reconstitutionUsedDifferentSyringeDifferentVaccine ?? null,
    reconstitutionFollowedManufacturerRecommendation:
      administrationError?.reconstitutionFollowedManufacturerRecommendation ?? null,
    reconstitutionKeyFindings: administrationError?.reconstitutionKeyFindings ?? null,
    hadPrescriptionError: administrationError?.hadPrescriptionError ?? null,
    prescriptionErrorNotes: administrationError?.prescriptionErrorNotes ?? null,
    hadContaminatedVaccine: administrationError?.hadContaminatedVaccine ?? null,
    contaminatedVaccineNotes: administrationError?.contaminatedVaccineNotes ?? null,
    hadAbnormalVaccineConditions: administrationError?.hadAbnormalVaccineConditions ?? null,
    abnormalConditionsNotes: administrationError?.abnormalConditionsNotes ?? null,
    hadPreparationError: administrationError?.hadPreparationError ?? null,
    preparationErrorNotes: administrationError?.preparationErrorNotes ?? null,
    hadHandlingError: administrationError?.hadHandlingError ?? null,
    handlingErrorNotes: administrationError?.handlingErrorNotes ?? null,
    hadImproperAdministration: administrationError?.hadImproperAdministration ?? null,
    improperAdministrationNotes: administrationError?.improperAdministrationNotes ?? null,
    notes: administrationError?.notes ?? null,
  };
}

export interface AdministrationErrorSectionProps {
  caseId: string;
  investigationId: string;
  administrationError: InvestigationAdministrationErrorDetail | null;
  disabled?: boolean;
  // La compuerta de F2 (SPEC FE13e §3.6, mismo patrón de E1/E2 de FE13d): si el identificador
  // `administrationErrorPractices` ya se reveló. A diferencia de E1/E2, revelarla SÍ escribe —
  // «Guardar y continuar» de F guarda la fila con lo que haya antes de abrir F2.
  practicesRevealed: boolean;
  onRevealPractices: () => void;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: InvestigationAdministrationErrorFormValues;
  onValuesChange?: (values: InvestigationAdministrationErrorFormValues) => void;
}

// Secciones F (jeringas y agujas) y F2 (reconstitución + errores de administración) del paso 5
// (SPEC FE13e §3.5, §4 paso 5): una sola fila, un solo `useForm`, DOS «Guardar y continuar» — el
// de F escribe la fila con lo que haya y revela F2; el de F2 escribe la misma fila otra vez y
// revela G (§3.6, §6 decisión 4). La ficha nace vacía al revelarse F, mismo patrón que
// `ColdChainSection`.
export function AdministrationErrorSection({
  caseId,
  investigationId,
  administrationError,
  disabled,
  practicesRevealed,
  onRevealPractices,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
}: AdministrationErrorSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationAdministrationErrorResource.useCreate();
  const update = investigationAdministrationErrorResource.useUpdate();

  const attemptedRef = useRef(false);

  function openAdministrationError() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          if (err instanceof EsaviApiError && err.code === 'INVADMER_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationAdministrationErrorByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (administrationError !== null || attemptedRef.current) return;
    openAdministrationError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [administrationError]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openAdministrationError();
  }

  // Calculado una sola vez, al montar sobre la fila que llegó (§3.4: "nace al cargar").
  const [initialValues] = useState(() => ({
    ...buildDefaultValues(administrationError),
    ...draftValues,
  }));

  const form = useForm<InvestigationAdministrationErrorFormValues>({
    resolver: zodResolver(
      investigationAdministrationErrorSaveSchema,
    ) as Resolver<InvestigationAdministrationErrorFormValues>,
    defaultValues: initialValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as InvestigationAdministrationErrorFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const usedAutoDisableSyringes = form.watch('usedAutoDisableSyringes');
  const syringeBlockOpen = isSyringeBlockOpen(usedAutoDisableSyringes);
  const usedOtherSyringes = form.watch('usedOtherSyringes');

  // LA COMPUERTA INVERTIDA (§1.A): sólo 'NO' abre el bloque. Salir de él en una sola escritura
  // (§3.5, decisión 3) — el `onChange` limpia los cinco campos aquí mismo, y
  // `buildAdministrationErrorSavePayload` es la red de seguridad que garantiza lo mismo en el
  // `PUT`, aunque este handler no se dispare por algún camino no cubierto.
  function handleUsedAutoDisableSyringesChange(next: AnswerOption | null) {
    form.setValue('usedAutoDisableSyringes', next, { shouldDirty: true, shouldValidate: true });
    if (!isSyringeBlockOpen(next)) {
      form.setValue('usedGlassSyringes', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('usedDisposableSyringes', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('usedRecycledDisposableSyringes', null, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue('usedOtherSyringes', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('otherSyringesDescription', null, { shouldDirty: true, shouldValidate: true });
    }
  }

  // El anidado (§1.C): `otherSyringesDescription` sólo se pinta con `usedOtherSyringes === true`.
  // Nunca se exige (§6 decisión 3) — sólo se limpia al apagar el interruptor.
  function handleUsedOtherSyringesChange(next: boolean | null) {
    form.setValue('usedOtherSyringes', next, { shouldDirty: true, shouldValidate: true });
    if (next !== true) {
      form.setValue('otherSyringesDescription', null, { shouldDirty: true, shouldValidate: true });
    }
  }

  // La regla de mínimo (§1.B) ancla su error en los cuatro campos a la vez (schemas.ts), así que
  // basta comprobar cualquiera de los cuatro para saber si el `<fieldset>` tiene que mostrarlo.
  const syringeTypeError =
    form.formState.errors.usedGlassSyringes ??
    form.formState.errors.usedDisposableSyringes ??
    form.formState.errors.usedRecycledDisposableSyringes ??
    form.formState.errors.usedOtherSyringes;

  async function saveRow(
    values: InvestigationAdministrationErrorFormValues,
    afterSave: () => void,
  ) {
    try {
      const payload = buildAdministrationErrorSavePayload(values);
      await update.mutateAsync({ id: investigationId, data: payload });
      toast.success(t('common.toast.updated'));
      form.reset(payload);
      afterSave();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      toast.error(getErrorMessage(err));
    }
  }

  async function handleSyringesSave(values: InvestigationAdministrationErrorFormValues) {
    await saveRow(values, onRevealPractices);
  }

  async function handlePracticesSave(values: InvestigationAdministrationErrorFormValues) {
    await saveRow(values, onSaved);
  }

  if (administrationError === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError ? getErrorMessage(create.error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {t('investigation.administrationError.openFailed')}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const isDisabled = disabled || administrationError === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      {/* F — texto informativo «Jeringas y agujas» (ESAVI-FORM.md §F), la única línea de
        cabecera que trae esta sección — no hay un segundo texto informativo que pintar. */}
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.administrationError.syringes.title')}
      </h3>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.administrationError.syringes.field.usedAutoDisableSyringes')}
        </span>
        <Controller
          control={form.control}
          name="usedAutoDisableSyringes"
          render={({ field }) => (
            <AnswerOptionField
              value={field.value ?? null}
              onChange={(next) => {
                handleUsedAutoDisableSyringesChange(next);
                field.onChange(next);
              }}
              ariaLabel={t(
                'investigation.administrationError.syringes.field.usedAutoDisableSyringes',
              )}
              disabled={isDisabled}
            />
          )}
        />
      </div>

      {/* Sólo este `<fieldset>` cuelga de la compuerta invertida (§1.A) — únicamente `'NO'` lo abre. */}
      <div aria-live="polite">
        {syringeBlockOpen && (
          <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
            <legend className="text-sm font-medium text-foreground">
              {t('investigation.administrationError.syringes.typesLegend')}
            </legend>
            {syringeTypeError && (
              <p role="alert" className="text-sm text-destructive">
                {t('investigation.administrationError.syringes.minimumRequired')}
              </p>
            )}

            {(
              [
                ['usedGlassSyringes', 'field.usedGlassSyringes'],
                ['usedDisposableSyringes', 'field.usedDisposableSyringes'],
                ['usedRecycledDisposableSyringes', 'field.usedRecycledDisposableSyringes'],
                ['usedOtherSyringes', 'field.usedOtherSyringes'],
              ] as const
            ).map(([name, labelKey]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <span id={`administrationError-${name}-label`} className="text-sm text-foreground">
                  {t(`investigation.administrationError.syringes.${labelKey}`)}
                </span>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <RadioGroup
                      aria-labelledby={`administrationError-${name}-label`}
                      value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                      onValueChange={(next) => {
                        const value = next === 'true';
                        if (name === 'usedOtherSyringes') {
                          handleUsedOtherSyringesChange(value);
                        } else {
                          field.onChange(value);
                        }
                      }}
                      className="flex w-auto gap-4"
                      disabled={isDisabled}
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
                  )}
                />
              </div>
            ))}

            <div aria-live="polite">
              {usedOtherSyringes === true && (
                <Controller
                  control={form.control}
                  name="otherSyringesDescription"
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="administrationError-otherSyringesDescription"
                        className="text-sm font-medium text-foreground"
                      >
                        {t(
                          'investigation.administrationError.syringes.field.otherSyringesDescription',
                        )}
                      </label>
                      <Textarea
                        id="administrationError-otherSyringesDescription"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        disabled={isDisabled}
                      />
                    </div>
                  )}
                />
              )}
            </div>
          </fieldset>
        )}
      </div>

      {/* Fuera del bloque pese al prefijo compartido (§1.C) — se ve con la compuerta en cualquier valor. */}
      <Controller
        control={form.control}
        name="syringesKeyFindings"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="administrationError-syringesKeyFindings"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.administrationError.syringes.field.syringesKeyFindings')}
            </label>
            <Textarea
              id="administrationError-syringesKeyFindings"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={isDisabled}
            />
          </div>
        )}
      />

      {!practicesRevealed && !isDisabled && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={update.isPending}
          onClick={() => void form.handleSubmit(handleSyringesSave)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}

      {/* F2 — Reconstitución y errores de administración: dos bloques visuales, un solo revelado
        (§3.6, decisión 5) — separarlos con un botón de guardado añadiría un viaje sin ganar nada. */}
      {practicesRevealed && (
        <>
          <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
            {t('investigation.administrationError.practices.title')}
          </h3>

          <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
            <legend className="text-sm font-medium text-foreground">
              {t('investigation.administrationError.practices.reconstitutionHeading')}
            </legend>

            {(
              [
                ['reconstitutionUsedSameSyringe', 'field.reconstitutionUsedSameSyringe'],
                [
                  'reconstitutionUsedSameSyringeDifferentVaccine',
                  'field.reconstitutionUsedSameSyringeDifferentVaccine',
                ],
                [
                  'reconstitutionUsedDifferentSyringeSameVial',
                  'field.reconstitutionUsedDifferentSyringeSameVial',
                ],
                [
                  'reconstitutionUsedDifferentSyringeDifferentVaccine',
                  'field.reconstitutionUsedDifferentSyringeDifferentVaccine',
                ],
                [
                  'reconstitutionFollowedManufacturerRecommendation',
                  'field.reconstitutionFollowedManufacturerRecommendation',
                ],
              ] as const
            ).map(([name, labelKey]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t(`investigation.administrationError.practices.${labelKey}`)}
                </span>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <AnswerOptionField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t(`investigation.administrationError.practices.${labelKey}`)}
                      disabled={isDisabled}
                    />
                  )}
                />
              </div>
            ))}

            <Controller
              control={form.control}
              name="reconstitutionKeyFindings"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="administrationError-reconstitutionKeyFindings"
                    className="text-sm font-medium text-foreground"
                  >
                    {t(
                      'investigation.administrationError.practices.field.reconstitutionKeyFindings',
                    )}
                  </label>
                  <Textarea
                    id="administrationError-reconstitutionKeyFindings"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                </div>
              )}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
            <legend className="text-sm font-medium text-foreground">
              {t('investigation.administrationError.practices.administrationErrorsHeading')}
            </legend>

            {/* Seis parejas, doce controles independientes (§3.5 C) — ninguna `*Notes` cuelga de su
              `had*`: un 'NO' con el motivo escrito es un registro válido, nunca se estorba. */}
            {(
              [
                ['hadPrescriptionError', 'prescriptionErrorNotes'],
                ['hadContaminatedVaccine', 'contaminatedVaccineNotes'],
                ['hadAbnormalVaccineConditions', 'abnormalConditionsNotes'],
                ['hadPreparationError', 'preparationErrorNotes'],
                ['hadHandlingError', 'handlingErrorNotes'],
                ['hadImproperAdministration', 'improperAdministrationNotes'],
              ] as const
            ).map(([flagName, notesName]) => (
              <div key={flagName} className="flex flex-col gap-3 md:flex-row md:gap-6">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {t(`investigation.administrationError.practices.field.${flagName}`)}
                  </span>
                  <Controller
                    control={form.control}
                    name={flagName}
                    render={({ field }) => (
                      <AnswerOptionField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        ariaLabel={t(
                          `investigation.administrationError.practices.field.${flagName}`,
                        )}
                        disabled={isDisabled}
                      />
                    )}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    htmlFor={`administrationError-${notesName}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {t(`investigation.administrationError.practices.field.${notesName}`)}
                  </label>
                  <Controller
                    control={form.control}
                    name={notesName}
                    render={({ field }) => (
                      <Textarea
                        id={`administrationError-${notesName}`}
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        disabled={isDisabled}
                      />
                    )}
                  />
                </div>
              </div>
            ))}

            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="administrationError-notes"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('investigation.administrationError.practices.field.notes')}
                  </label>
                  <Textarea
                    id="administrationError-notes"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                </div>
              )}
            />
          </fieldset>

          {showSaveButton && (
            <Button
              type="button"
              className="min-h-11 w-full md:w-auto md:self-end"
              disabled={isDisabled || update.isPending}
              onClick={() => void form.handleSubmit(handlePracticesSave)()}
            >
              {t('caseWizard.actions.saveAndContinue')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
