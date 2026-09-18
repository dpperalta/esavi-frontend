import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationClinicalEvaluationDetail } from '@/contracts/declared/investigationClinicalEvaluation';
import {
  investigationClinicalEvaluationByCaseKey,
  investigationClinicalEvaluationResource,
  useCreateInvestigationClinicalEvaluation,
} from '@/features/investigation/api';
import {
  buildClinicalEvaluationSavePayload,
  investigationClinicalEvaluationErrorFieldMap,
  investigationClinicalEvaluationSaveSchema,
  isFlagExplanationRequirementMet,
  type InvestigationClinicalEvaluationFormValues,
  type InvestigationSectionHandle,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

interface TriStateSwitchProps {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  ariaLabel: string;
  disabled?: boolean;
}

// The third state a plain boolean `<Switch>` can't express on its own (SPEC FE13c §3.5 A, §3.7):
// `null` means "not checked", not "no" — on the two suspicions below that distinction is the
// whole reason this control exists (§1.D). `aria-checked="mixed"` on `null` plus the reset action
// make the third state perceivable without relying on color alone.
function TriStateSwitch({ value, onChange, ariaLabel, disabled }: TriStateSwitchProps) {
  const { t } = useTranslation();
  const stateLabel =
    value === null
      ? t('investigation.clinicalEvaluation.notChecked')
      : value
        ? t('common.answerOption.yes')
        : t('common.answerOption.no');

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2">
      <Switch
        checked={value === true}
        aria-checked={value === null ? 'mixed' : value}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className="text-sm text-foreground">{ariaLabel}</span>
      <span className="text-sm text-muted-foreground">({stateLabel})</span>
      {value !== null && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="min-h-11 px-1 text-xs"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {t('investigation.clinicalEvaluation.markNotChecked')}
        </Button>
      )}
    </div>
  );
}

function buildDefaultValues(
  evaluation: InvestigationClinicalEvaluationDetail | null,
): InvestigationClinicalEvaluationFormValues {
  return {
    receivedMedicalAttention: evaluation?.receivedMedicalAttention ?? null,
    sourceExam: evaluation?.sourceExam ?? null,
    sourceDocuments: evaluation?.sourceDocuments ?? null,
    sourceVerbalAutopsy: evaluation?.sourceVerbalAutopsy ?? null,
    sourceOther: evaluation?.sourceOther ?? null,
    otherDescription: evaluation?.otherDescription ?? null,
    suspectedChildAbuse: evaluation?.suspectedChildAbuse ?? null,
    childAbuseExplanation: evaluation?.childAbuseExplanation ?? null,
    suspectedDomesticViolence: evaluation?.suspectedDomesticViolence ?? null,
    domesticViolenceExplanation: evaluation?.domesticViolenceExplanation ?? null,
    // Whatever the backend decrypted comes back in Title Case (§1.E, §8) — the screen shows what
    // was returned, never what was typed.
    clinicalDetailsPersonName: evaluation?.clinicalDetailsPersonName ?? null,
    familyClinicalDetails: evaluation?.familyClinicalDetails ?? null,
    completeClinicalSummary: evaluation?.completeClinicalSummary ?? null,
    signsAndSymptoms: evaluation?.signsAndSymptoms ?? null,
    otherSocialBackground: evaluation?.otherSocialBackground ?? null,
    notes: evaluation?.notes ?? null,
  };
}

export interface ClinicalEvaluationSectionProps {
  caseId: string;
  investigationId: string;
  clinicalEvaluation: InvestigationClinicalEvaluationDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: InvestigationClinicalEvaluationFormValues;
  onValuesChange?: (values: InvestigationClinicalEvaluationFormValues) => void;
  onRegisterHandle?: (handle: InvestigationSectionHandle | null) => void;
}

// Section C of step 5 (SPEC FE13c §3.5 A) — the sixteen columns of `ESAVI-FORM.md` C.1–C.16,
// minus C.7/7.1–7.3 (the institutions list, a section of its own below) and C.17 (the
// diagnostics list). The ficha opens the moment this section reveals, with an empty
// `POST { investigationId }` (§2, §4 paso 5) — the same idea `MedicalHistorySection` applies to
// its own row. Controls stay disabled until that resolves.
export function ClinicalEvaluationSection({
  caseId,
  investigationId,
  clinicalEvaluation,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
  onRegisterHandle,
}: ClinicalEvaluationSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = useCreateInvestigationClinicalEvaluation();
  const update = investigationClinicalEvaluationResource.useUpdate();

  // Guards the opening `POST` against a second attempt — StrictMode's double effect in dev, or a
  // re-render while the mutation is still in flight — mirroring `attemptedRef` in
  // `MedicalHistorySection`. Reset by hand only in `handleRetry`.
  const attemptedRef = useRef(false);

  function openClinicalEvaluation() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          // The 1:1 row already exists (§1.B, a race between two tabs on the same case): re-read
          // instead of retrying the `POST`, and swallow it — it isn't the investigator's error.
          if (err instanceof EsaviApiError && err.code === 'INVCLIEV_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationClinicalEvaluationByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (clinicalEvaluation !== null || attemptedRef.current) return;
    openClinicalEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicalEvaluation]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openClinicalEvaluation();
  }

  const form = useForm<InvestigationClinicalEvaluationFormValues>({
    resolver: zodResolver(
      investigationClinicalEvaluationSaveSchema,
    ) as Resolver<InvestigationClinicalEvaluationFormValues>,
    defaultValues: { ...buildDefaultValues(clinicalEvaluation), ...draftValues },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as InvestigationClinicalEvaluationFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const sourceOther = form.watch('sourceOther');
  const suspectedChildAbuse = form.watch('suspectedChildAbuse');
  const suspectedDomesticViolence = form.watch('suspectedDomesticViolence');
  const otherDescription = form.watch('otherDescription');
  const childAbuseExplanation = form.watch('childAbuseExplanation');
  const domesticViolenceExplanation = form.watch('domesticViolenceExplanation');

  async function handleValidSubmit(values: InvestigationClinicalEvaluationFormValues) {
    const payload = buildClinicalEvaluationSavePayload(values);
    try {
      await update.mutateAsync({ id: investigationId, data: payload });
      toast.success(t('common.toast.updated'));
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      const field = investigationClinicalEvaluationErrorFieldMap[err.code];
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
    if (clinicalEvaluation === null) {
      onRegisterHandle?.(null);
      return;
    }
    onRegisterHandle?.({ save: () => performSaveRef.current(), isDirty });
    return () => onRegisterHandle?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterHandle, isDirty, clinicalEvaluation === null]);

  // La fila no existe todavía, o la `POST` de apertura falló de plano (§4 paso 5): sin ficha no
  // hay formulario que pintar. `INVCLIEV_001_ALREADY_EXISTS` nunca llega hasta aquí — resetea la
  // mutación y relee en vez de mostrarse como error.
  if (clinicalEvaluation === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError
        ? getErrorMessage(create.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {t('investigation.clinicalEvaluation.openFailed')}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  // Deshabilitado mientras la ficha aún no existe, además de por `CLOSED` o por lo que decida el
  // llamador.
  const isDisabled = disabled || clinicalEvaluation === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.clinicalEvaluation.title')}
      </h3>

      <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
        <legend className="sr-only">{t('investigation.clinicalEvaluation.title')}</legend>

        {/* C.1 — no gobierna nada de lo que sigue (§6 decision 9): todo se ve siempre. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.clinicalEvaluation.fields.receivedMedicalAttention')}
          </span>
          <Controller
            control={form.control}
            name="receivedMedicalAttention"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.clinicalEvaluation.fields.receivedMedicalAttention')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        {/* C.2–C.5, dentro de un mismo <fieldset> con <legend> (§3.7). */}
        <fieldset className="flex flex-col gap-2" disabled={isDisabled}>
          <legend className="text-sm font-medium text-foreground">
            {t('investigation.clinicalEvaluation.sourcesLegend')}
          </legend>
          <Controller
            control={form.control}
            name="sourceExam"
            render={({ field }) => (
              <TriStateSwitch
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.clinicalEvaluation.fields.sourceExam')}
                disabled={isDisabled}
              />
            )}
          />
          <Controller
            control={form.control}
            name="sourceDocuments"
            render={({ field }) => (
              <TriStateSwitch
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.clinicalEvaluation.fields.sourceDocuments')}
                disabled={isDisabled}
              />
            )}
          />
          <Controller
            control={form.control}
            name="sourceVerbalAutopsy"
            render={({ field }) => (
              <TriStateSwitch
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.clinicalEvaluation.fields.sourceVerbalAutopsy')}
                disabled={isDisabled}
              />
            )}
          />
          <Controller
            control={form.control}
            name="sourceOther"
            render={({ field }) => (
              <TriStateSwitch
                value={field.value ?? null}
                onChange={(next) => {
                  field.onChange(next);
                  // Apagar "otro" limpia el campo ahí mismo (§3.5 A, §7.3): validar contra un
                  // texto que todavía está ahí bloquearía un guardado legítimo.
                  if (next !== true) {
                    form.setValue('otherDescription', null, { shouldValidate: true });
                  }
                }}
                ariaLabel={t('investigation.clinicalEvaluation.fields.sourceOther')}
                disabled={isDisabled}
              />
            )}
          />
        </fieldset>

        {/* C.6 — visible sólo con sourceOther === true (§3.5 A). */}
        <div aria-live="polite">
          {sourceOther === true && (
            <Controller
              control={form.control}
              name="otherDescription"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="clinicalEvaluation-otherDescription"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('investigation.clinicalEvaluation.fields.otherDescription')}
                  </label>
                  <Textarea
                    id="clinicalEvaluation-otherDescription"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                  {!isFlagExplanationRequirementMet(sourceOther, otherDescription) && (
                    <p role="alert" className="text-sm text-destructive">
                      {t('investigation.clinicalEvaluation.errors.otherDescriptionRequired')}
                    </p>
                  )}
                </div>
              )}
            />
          )}
        </div>

        {/* C.8 — cifrado, sin maxLength: es text, no varchar(n) (§1.E). */}
        <Controller
          control={form.control}
          name="clinicalDetailsPersonName"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="clinicalEvaluation-clinicalDetailsPersonName"
                className="text-sm font-medium text-foreground"
              >
                {t('investigation.clinicalEvaluation.fields.clinicalDetailsPersonName')}
              </label>
              <Input
                id="clinicalEvaluation-clinicalDetailsPersonName"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />

        {/* C.9–C.12, dentro de un mismo <fieldset> con <legend> (§3.7). */}
        <fieldset className="flex flex-col gap-3" disabled={isDisabled}>
          <legend className="text-sm font-medium text-foreground">
            {t('investigation.clinicalEvaluation.suspicionsLegend')}
          </legend>

          <div className="flex flex-col gap-1.5">
            <Controller
              control={form.control}
              name="suspectedChildAbuse"
              render={({ field }) => (
                <TriStateSwitch
                  value={field.value ?? null}
                  onChange={(next) => {
                    field.onChange(next);
                    if (next !== true) {
                      form.setValue('childAbuseExplanation', null, { shouldValidate: true });
                    }
                  }}
                  ariaLabel={t('investigation.clinicalEvaluation.fields.suspectedChildAbuse')}
                  disabled={isDisabled}
                />
              )}
            />
            <div aria-live="polite">
              {suspectedChildAbuse === true && (
                <Controller
                  control={form.control}
                  name="childAbuseExplanation"
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="clinicalEvaluation-childAbuseExplanation"
                        className="text-sm font-medium text-foreground"
                      >
                        {t('investigation.clinicalEvaluation.fields.childAbuseExplanation')}
                      </label>
                      <Textarea
                        id="clinicalEvaluation-childAbuseExplanation"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        disabled={isDisabled}
                      />
                      {!isFlagExplanationRequirementMet(
                        suspectedChildAbuse,
                        childAbuseExplanation,
                      ) && (
                        <p role="alert" className="text-sm text-destructive">
                          {t('investigation.clinicalEvaluation.errors.childAbuseExplanationRequired')}
                        </p>
                      )}
                    </div>
                  )}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Controller
              control={form.control}
              name="suspectedDomesticViolence"
              render={({ field }) => (
                <TriStateSwitch
                  value={field.value ?? null}
                  onChange={(next) => {
                    field.onChange(next);
                    if (next !== true) {
                      form.setValue('domesticViolenceExplanation', null, { shouldValidate: true });
                    }
                  }}
                  ariaLabel={t('investigation.clinicalEvaluation.fields.suspectedDomesticViolence')}
                  disabled={isDisabled}
                />
              )}
            />
            <div aria-live="polite">
              {suspectedDomesticViolence === true && (
                <Controller
                  control={form.control}
                  name="domesticViolenceExplanation"
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="clinicalEvaluation-domesticViolenceExplanation"
                        className="text-sm font-medium text-foreground"
                      >
                        {t('investigation.clinicalEvaluation.fields.domesticViolenceExplanation')}
                      </label>
                      <Textarea
                        id="clinicalEvaluation-domesticViolenceExplanation"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        disabled={isDisabled}
                      />
                      {!isFlagExplanationRequirementMet(
                        suspectedDomesticViolence,
                        domesticViolenceExplanation,
                      ) && (
                        <p role="alert" className="text-sm text-destructive">
                          {t(
                            'investigation.clinicalEvaluation.errors.domesticViolenceExplanationRequired',
                          )}
                        </p>
                      )}
                    </div>
                  )}
                />
              )}
            </div>
          </div>
        </fieldset>

        {/* C.13–C.16 y notes, texto libre sin tope, dentro de un tercer <fieldset> (§3.7). */}
        <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
          <legend className="text-sm font-medium text-foreground">
            {t('investigation.clinicalEvaluation.narrativeLegend')}
          </legend>

          <Controller
            control={form.control}
            name="otherSocialBackground"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="clinicalEvaluation-otherSocialBackground"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.clinicalEvaluation.fields.otherSocialBackground')}
                </label>
                <Textarea
                  id="clinicalEvaluation-otherSocialBackground"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={isDisabled}
                />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="signsAndSymptoms"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="clinicalEvaluation-signsAndSymptoms"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.clinicalEvaluation.fields.signsAndSymptoms')}
                </label>
                <Textarea
                  id="clinicalEvaluation-signsAndSymptoms"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={isDisabled}
                />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="familyClinicalDetails"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="clinicalEvaluation-familyClinicalDetails"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.clinicalEvaluation.fields.familyClinicalDetails')}
                </label>
                <Textarea
                  id="clinicalEvaluation-familyClinicalDetails"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={isDisabled}
                />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="completeClinicalSummary"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="clinicalEvaluation-completeClinicalSummary"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.clinicalEvaluation.fields.completeClinicalSummary')}
                </label>
                <Textarea
                  id="clinicalEvaluation-completeClinicalSummary"
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
                  htmlFor="clinicalEvaluation-notes"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.fields.notes')}
                </label>
                <Textarea
                  id="clinicalEvaluation-notes"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={isDisabled}
                />
              </div>
            )}
          />
        </fieldset>
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
