import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationMedicalHistoryDetail } from '@/contracts/declared/investigationMedicalHistory';
import { investigationMedicalHistoryResource, useNewbornConditionsByMedicalHistory } from '@/features/investigation/api';
import { NewbornConditionList } from '@/features/investigation/NewbornConditionList';
import {
  isPregnancyBlockOpen,
  buildMedicalHistorySavePayload,
  medicalHistoryErrorFieldMap,
  medicalHistorySaveSchema,
  type MedicalHistoryFormValues,
} from '@/features/investigation/schemas';
import type { PregnancyGateState } from '@/features/notification/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { NumberField } from '@/shared/components/NumberField';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Textarea } from '@/shared/components/ui/textarea';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';

// Independent `useForm` from `MedicalHistorySection`'s, hydrated from the same row (SPEC FE13b
// §4 paso 6, decided while implementing): by the time B1 reveals, B's own save already went
// through — same criterion as every other pair of self-contained sections in this repository
// (`SourceSection`, `BasicInfoSection`…), none of which share a `useForm` instance across files.
function buildDefaultValues(
  medicalHistory: InvestigationMedicalHistoryDetail | null,
): MedicalHistoryFormValues {
  return {
    hasPriorHospitalizationHistory: medicalHistory?.hasPriorHospitalizationHistory ?? null,
    priorHospitalizationObservations: medicalHistory?.priorHospitalizationObservations ?? null,
    hasFamilyHistory: medicalHistory?.hasFamilyHistory ?? null,
    familyHistoryObservations: medicalHistory?.familyHistoryObservations ?? null,
    isPregnancyConfirmed: medicalHistory?.isPregnancyConfirmed ?? null,
    gestationalWeeks: medicalHistory?.gestationalWeeks ?? null,
    gestationMethodItemId: medicalHistory?.gestationMethodItemId ?? null,
    deliveryItemId: medicalHistory?.deliveryItemId ?? null,
    birthItemId: medicalHistory?.birthItemId ?? null,
    pregnancyOutcomeItemId: medicalHistory?.pregnancyOutcomeItemId ?? null,
    hasPregnancyRiskFactor: medicalHistory?.hasPregnancyRiskFactor ?? null,
    riskFactorDescription: medicalHistory?.riskFactorDescription ?? null,
    birthWeightGrams:
      medicalHistory?.birthWeightGrams != null ? Number(medicalHistory.birthWeightGrams) : null,
    wasBreastfed: medicalHistory?.wasBreastfed ?? null,
    notes: medicalHistory?.notes ?? null,
  };
}

export interface PregnancySectionProps {
  investigationId: string;
  medicalHistory: InvestigationMedicalHistoryDetail | null;
  pregnancyGate: PregnancyGateState;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: MedicalHistoryFormValues;
  onValuesChange?: (values: MedicalHistoryFormValues) => void;
}

// Section B1 of step 5 (SPEC FE13b §3.5 A, §4 paso 6): the nine columns
// `isPregnancyConfirmed` governs, over the same row and the same `PUT` as `MedicalHistorySection`
// — never `PregnancySection.tsx` under `features/esaviCase/`, which writes `notificationPregnancy`
// on step 4's own table (§1 "the granddaughter trap" and §3.6 "convive con el del paso 4").
//
// `pregnancyGate === 'hidden'` paints nothing at all, same criterion as the step-4 sibling; the
// interior gate — the nine columns behind `isPregnancyConfirmed === 'YES'` — is derived in render,
// there is no `showPregnancyFields` flag anywhere.
export function PregnancySection({
  investigationId,
  medicalHistory,
  pregnancyGate,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
}: PregnancySectionProps) {
  const { t } = useTranslation();
  const update = investigationMedicalHistoryResource.useUpdate();

  const form = useForm<MedicalHistoryFormValues>({
    resolver: zodResolver(medicalHistorySaveSchema) as Resolver<MedicalHistoryFormValues>,
    defaultValues: { ...buildDefaultValues(medicalHistory), ...draftValues },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as MedicalHistoryFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const isPregnancyConfirmed = form.watch('isPregnancyConfirmed');
  const blockOpen = isPregnancyBlockOpen(isPregnancyConfirmed);
  const hasPregnancyRiskFactor = form.watch('hasPregnancyRiskFactor');

  // B2's gate (SPEC FE13b §3.5 C, §4 paso 7): resolved against the loaded catalog's `value`,
  // never `code` (CASE-PROCESS.md §7.2) — the response object of `pregnancyOutcomeItemId` itself
  // doesn't carry `value` (§3.3), which is exactly why this reads the same `<CatalogSelect>`
  // catalog instead of the row.
  const pregnancyOutcomeItemId = form.watch('pregnancyOutcomeItemId');
  const pregnancyOutcomeCatalog = useCatalogItemsByTypeCode('pregnancyOutcome');
  const showsNewbornConditions =
    blockOpen &&
    pregnancyOutcomeCatalog.rows.find((row) => row.catalogItemId === pregnancyOutcomeItemId)
      ?.value === '2';

  // Hoisted out of `NewbornConditionList` (SPEC FE13b §4 paso 8): the block below needs the
  // active count even while B2 isn't mounted — the investigator can flip the outcome away from
  // "value === '2'" in the same keystroke that would unmount it, and the count has to survive
  // that render to still block the save. Same `queryKey` as the list's own hook, so this doesn't
  // add a second network round trip once both are mounted — TanStack Query dedupes it.
  const newbornConditions = useNewbornConditionsByMedicalHistory(investigationId, true);
  const activeNewbornConditionsCount = newbornConditions.data?.rows.length ?? 0;
  const [outcomeLockOpen, setOutcomeLockOpen] = useState(false);

  async function handleValidSubmit(values: MedicalHistoryFormValues) {
    const payload = buildMedicalHistorySavePayload(values);

    // The block of §3.5 C, §4 paso 8: the resulting outcome is read off the payload just built —
    // it's already `null` if the pregnancy block closed — never off the still-mounted `<CatalogSelect>`
    // value, so closing the outer block counts as "changing the outcome away" too.
    const resultingOutcomeIsLiveWithCondition =
      pregnancyOutcomeCatalog.rows.find((row) => row.catalogItemId === payload.pregnancyOutcomeItemId)
        ?.value === '2';
    if (activeNewbornConditionsCount > 0 && !resultingOutcomeIsLiveWithCondition) {
      setOutcomeLockOpen(true);
      return;
    }

    try {
      await update.mutateAsync({ id: investigationId, data: payload });
      toast.success(t('common.toast.updated'));
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      const field = medicalHistoryErrorFieldMap[err.code];
      if (field) {
        form.setError(field, { type: 'server', message: err.message });
        return;
      }
      toast.error(getErrorMessage(err));
    }
  }

  if (pregnancyGate === 'hidden') {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        {/* Text, not an icon or a color (§3.7): a screen reader has to announce it next to the
          title, because it changes the meaning of everything under it. */}
        {pregnancyGate === 'visibleIfApplicable' && (
          <span className="text-xs text-muted-foreground">
            {t('investigation.pregnancy.ifApplicable')}
          </span>
        )}
        <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
          {t('investigation.pregnancy.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('investigation.pregnancy.hint')}</p>
      </div>

      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="sr-only">{t('investigation.pregnancy.title')}</legend>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.pregnancy.isPregnancyConfirmed')}
          </span>
          <Controller
            control={form.control}
            name="isPregnancyConfirmed"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.pregnancy.isPregnancyConfirmed')}
                variant="full"
                disabled={disabled}
              />
            )}
          />
        </div>

        {/* The nine columns of the interior gate, appearing from a change in the control above
          (§3.7). */}
        <div aria-live="polite">
          {blockOpen && (
            <fieldset className="flex flex-col gap-4">
              <legend className="sr-only">{t('investigation.pregnancy.title')}</legend>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="pregnancy-gestationalWeeks"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.pregnancy.gestationalWeeks')}
                </label>
                <Controller
                  control={form.control}
                  name="gestationalWeeks"
                  render={({ field }) => (
                    <NumberField
                      id="pregnancy-gestationalWeeks"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.gestationalWeeks')}
                      min={0}
                      max={45}
                      disabled={disabled}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.gestationMethod')}
                </span>
                <Controller
                  control={form.control}
                  name="gestationMethodItemId"
                  render={({ field }) => (
                    <CatalogSelect
                      typeCode="gestationMethod"
                      emit="id"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.gestationMethod')}
                      disabled={disabled}
                    />
                  )}
                />
                {form.formState.errors.gestationMethodItemId && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.gestationMethodItemId.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.hasPregnancyRiskFactor')}
                </span>
                <Controller
                  control={form.control}
                  name="hasPregnancyRiskFactor"
                  render={({ field }) => (
                    <AnswerOptionField
                      value={field.value ?? null}
                      onChange={(next) => {
                        field.onChange(next);
                        // Clears the explanation the moment the flag stops being `'YES'` (§3.5
                        // B1): a hidden textarea keeping stale text would resurface it if the
                        // investigator turns the flag back on.
                        if (next !== 'YES') {
                          form.setValue('riskFactorDescription', null, { shouldDirty: true });
                        }
                      }}
                      ariaLabel={t('investigation.pregnancy.hasPregnancyRiskFactor')}
                      variant="unknown"
                      disabled={disabled}
                    />
                  )}
                />
              </div>

              <div aria-live="polite">
                {hasPregnancyRiskFactor === 'YES' && (
                  <Controller
                    control={form.control}
                    name="riskFactorDescription"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pregnancy-riskFactorDescription"
                          className="text-sm font-medium text-foreground"
                        >
                          {t('investigation.pregnancy.riskFactorDescription')}
                        </label>
                        <Textarea
                          id="pregnancy-riskFactorDescription"
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(event.target.value || null)}
                          disabled={disabled}
                        />
                      </div>
                    )}
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.delivery')}
                </span>
                <Controller
                  control={form.control}
                  name="deliveryItemId"
                  render={({ field }) => (
                    <CatalogSelect
                      typeCode="deliveryType"
                      emit="id"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.delivery')}
                      disabled={disabled}
                    />
                  )}
                />
                {form.formState.errors.deliveryItemId && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.deliveryItemId.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.birth')}
                </span>
                <Controller
                  control={form.control}
                  name="birthItemId"
                  render={({ field }) => (
                    <CatalogSelect
                      typeCode="birthCondition"
                      emit="id"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.birth')}
                      disabled={disabled}
                    />
                  )}
                />
                {form.formState.errors.birthItemId && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.birthItemId.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="pregnancy-birthWeightGrams"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.pregnancy.birthWeightGrams')}
                </label>
                <Controller
                  control={form.control}
                  name="birthWeightGrams"
                  render={({ field }) => (
                    <NumberField
                      id="pregnancy-birthWeightGrams"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.birthWeightGrams')}
                      min={0}
                      max={6000}
                      disabled={disabled}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.pregnancyOutcome')}
                </span>
                <Controller
                  control={form.control}
                  name="pregnancyOutcomeItemId"
                  render={({ field }) => (
                    <CatalogSelect
                      typeCode="pregnancyOutcome"
                      emit="id"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.pregnancyOutcome')}
                      disabled={disabled}
                    />
                  )}
                />
                {form.formState.errors.pregnancyOutcomeItemId && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.pregnancyOutcomeItemId.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.pregnancy.wasBreastfed')}
                </span>
                <Controller
                  control={form.control}
                  name="wasBreastfed"
                  render={({ field }) => (
                    <AnswerOptionField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('investigation.pregnancy.wasBreastfed')}
                      variant="full"
                      disabled={disabled}
                    />
                  )}
                />
              </div>
            </fieldset>
          )}
        </div>
      </fieldset>

      {/* B2 (SPEC FE13b §4 paso 7) — appears from a change in `pregnancyOutcomeItemId` above. */}
      <div aria-live="polite">
        {showsNewbornConditions && (
          <NewbornConditionList investigationId={investigationId} disabled={disabled} />
        )}
      </div>

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={disabled || update.isPending}
          onClick={() => void form.handleSubmit(handleValidSubmit)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}

      {/* §3.5 C, §4 paso 8: no ofrece "Vaciar" ni "Retirar" — B2 no tiene borrado desde esta
        pantalla, con o sin ADMIN (§2). Sólo explica por qué el guardado no salió y cierra. */}
      <Dialog open={outcomeLockOpen} onOpenChange={setOutcomeLockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('investigation.newbornCondition.outcomeLocked.title')}</DialogTitle>
          </DialogHeader>
          <p role="alert" className="text-sm text-foreground">
            {t('investigation.newbornCondition.outcomeLocked.description', {
              count: activeNewbornConditionsCount,
            })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOutcomeLockOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
