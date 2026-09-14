import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationMedicalHistoryDetail } from '@/contracts/declared/investigationMedicalHistory';
import {
  investigationMedicalHistoryByCaseKey,
  investigationMedicalHistoryResource,
} from '@/features/investigation/api';
import {
  buildMedicalHistorySavePayload,
  medicalHistoryErrorFieldMap,
  medicalHistorySaveSchema,
  type MedicalHistoryFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(
  medicalHistory: InvestigationMedicalHistoryDetail | null,
): MedicalHistoryFormValues {
  return {
    hasPriorHospitalizationHistory: medicalHistory?.hasPriorHospitalizationHistory ?? null,
    priorHospitalizationObservations: medicalHistory?.priorHospitalizationObservations ?? null,
    hasFamilyHistory: medicalHistory?.hasFamilyHistory ?? null,
    familyHistoryObservations: medicalHistory?.familyHistoryObservations ?? null,
    // The nine columns of B1 (SPEC FE13b §4 paso 6 builds their controls) still ride in this
    // same form — one schema, one row — they just aren't rendered by this section yet.
    isPregnancyConfirmed: medicalHistory?.isPregnancyConfirmed ?? null,
    gestationalWeeks: medicalHistory?.gestationalWeeks ?? null,
    gestationMethodItemId: medicalHistory?.gestationMethodItemId ?? null,
    deliveryItemId: medicalHistory?.deliveryItemId ?? null,
    birthItemId: medicalHistory?.birthItemId ?? null,
    pregnancyOutcomeItemId: medicalHistory?.pregnancyOutcomeItemId ?? null,
    hasPregnancyRiskFactor: medicalHistory?.hasPregnancyRiskFactor ?? null,
    riskFactorDescription: medicalHistory?.riskFactorDescription ?? null,
    // `numeric(8,2)` through pg comes back as a string (contracts/declared); the form speaks
    // `number | null`, same conversion as `vaccinationLatitude` in `BasicInfoSection`.
    birthWeightGrams:
      medicalHistory?.birthWeightGrams != null ? Number(medicalHistory.birthWeightGrams) : null,
    wasBreastfed: medicalHistory?.wasBreastfed ?? null,
    notes: medicalHistory?.notes ?? null,
  };
}

export interface MedicalHistorySectionProps {
  caseId: string;
  investigationId: string;
  medicalHistory: InvestigationMedicalHistoryDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  // Same combined-draft mechanism as the other three sections of this step (§3.4): this one
  // never touches `localStorage` directly.
  draftValues?: MedicalHistoryFormValues;
  onValuesChange?: (values: MedicalHistoryFormValues) => void;
}

// Section B of step 5 (SPEC FE13b §3.5 A, §4 paso 5): the five always-on columns of
// `investigationMedicalHistory` — `isPregnancyConfirmed` and the nine it governs are B1, built in
// the next plan step over this very same form and schema (§3.4: "un solo formulario y una sola
// escritura").
//
// Unlike `SourceSection`/`TeamMemberList`, the row isn't created lazily on the first save: it
// opens the moment this section reveals, with an empty `POST { investigationId }` — the ficha
// exists before the investigator answers a single question, same idea as the investigation
// header itself (`InvestigationStep`'s `createHeader`). Controls stay disabled until that
// resolves (§3.6).
export function MedicalHistorySection({
  caseId,
  investigationId,
  medicalHistory,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
}: MedicalHistorySectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationMedicalHistoryResource.useCreate();
  const update = investigationMedicalHistoryResource.useUpdate();

  // Guards the opening `POST` against a second attempt — StrictMode's double effect in dev, or a
  // re-render while the mutation is still in flight — mirroring `attemptedCaseIdRef` in
  // `InvestigationStep`. Reset by hand only in `handleRetry`.
  const attemptedRef = useRef(false);

  function openMedicalHistory() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          // The 1:1 row already exists (§3.6, a race between two tabs on the same case): re-read
          // instead of retrying the `POST`, and swallow it — it isn't the investigator's error.
          if (err instanceof EsaviApiError && err.code === 'INVMEDH_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationMedicalHistoryByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (medicalHistory !== null || attemptedRef.current) return;
    openMedicalHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicalHistory]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openMedicalHistory();
  }

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

  async function handleValidSubmit(values: MedicalHistoryFormValues) {
    const payload = buildMedicalHistorySavePayload(values);
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

  // The row isn't there yet, or the opening `POST` failed outright (§3.6): no form to paint over
  // a ficha that can't be saved. `INVMEDH_001_ALREADY_EXISTS` never reaches here — it resets the
  // mutation and re-reads instead of surfacing as an error.
  if (medicalHistory === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError ? getErrorMessage(create.error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {t('investigation.medicalHistory.openFailed')}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  // Deshabilitado mientras la fila aún no existe (§3.6), además de por `CLOSED` o por lo que
  // decida el llamador.
  const isDisabled = disabled || medicalHistory === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.medicalHistory.title')}
      </h3>

      <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
        <legend className="sr-only">{t('investigation.medicalHistory.title')}</legend>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.medicalHistory.hasPriorHospitalizationHistory')}
          </span>
          <Controller
            control={form.control}
            name="hasPriorHospitalizationHistory"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.medicalHistory.hasPriorHospitalizationHistory')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        {/* Always visible (§3.5 A): doesn't hang off `hasPriorHospitalizationHistory`, never
          clears when the flag changes. */}
        <Controller
          control={form.control}
          name="priorHospitalizationObservations"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="medicalHistory-priorHospitalizationObservations"
                className="text-sm font-medium text-foreground"
              >
                {t('investigation.medicalHistory.priorHospitalizationObservations')}
              </label>
              <Textarea
                id="medicalHistory-priorHospitalizationObservations"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.medicalHistory.hasFamilyHistory')}
          </span>
          <Controller
            control={form.control}
            name="hasFamilyHistory"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.medicalHistory.hasFamilyHistory')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        {/* Always visible too (§3.5 A) — same reasoning as the observation above. */}
        <Controller
          control={form.control}
          name="familyHistoryObservations"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="medicalHistory-familyHistoryObservations"
                className="text-sm font-medium text-foreground"
              >
                {t('investigation.medicalHistory.familyHistoryObservations')}
              </label>
              <Textarea
                id="medicalHistory-familyHistoryObservations"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="medicalHistory-notes"
                className="text-sm font-medium text-foreground"
              >
                {t('investigation.medicalHistory.notes')}
              </label>
              <Textarea
                id="medicalHistory-notes"
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
          onClick={() => void form.handleSubmit(handleValidSubmit)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
