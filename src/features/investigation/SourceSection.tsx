import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import { investigationSourceByCaseKey, investigationSourceResource } from '@/features/investigation/api';
import {
  investigationSourceSaveSchema,
  isOtherSourceDescriptionRequirementMet,
  type InvestigationSourceFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

// The eight sources from `ESAVI-FORM.md` §1, in order — the ninth row (`otherDescription`) is
// conditional and rendered separately, not in this list.
const SOURCE_SWITCHES = [
  { name: 'history', labelKey: 'investigation.source.history' },
  { name: 'interviewVaccinatedPerson', labelKey: 'investigation.source.interviewVaccinatedPerson' },
  { name: 'interviewHealthWorker', labelKey: 'investigation.source.interviewHealthWorker' },
  { name: 'vaccinationRecord', labelKey: 'investigation.source.vaccinationRecord' },
  { name: 'autopsyRecord', labelKey: 'investigation.source.autopsyRecord' },
  { name: 'verbalAutopsyRecord', labelKey: 'investigation.source.verbalAutopsyRecord' },
  { name: 'investigationReport', labelKey: 'investigation.source.investigationReport' },
  { name: 'other', labelKey: 'investigation.source.other' },
] as const satisfies ReadonlyArray<{
  name: keyof InvestigationSourceFormValues;
  labelKey: string;
}>;

function buildDefaultValues(source: InvestigationSourceDetail | null): InvestigationSourceFormValues {
  return {
    history: source?.history ?? null,
    interviewVaccinatedPerson: source?.interviewVaccinatedPerson ?? null,
    interviewHealthWorker: source?.interviewHealthWorker ?? null,
    vaccinationRecord: source?.vaccinationRecord ?? null,
    autopsyRecord: source?.autopsyRecord ?? null,
    verbalAutopsyRecord: source?.verbalAutopsyRecord ?? null,
    investigationReport: source?.investigationReport ?? null,
    other: source?.other ?? null,
    otherDescription: source?.otherDescription ?? null,
    notes: source?.notes ?? null,
  };
}

export interface SourceSectionProps {
  caseId: string;
  investigationId: string;
  investigationSource: InvestigationSourceDetail | null;
  disabled?: boolean;
  // Only section 1 carries a button while the step hasn't completed once (SPEC FE13a §3.6); on
  // re-entering a step that already existed, `InvestigationStep` hides it and everything shows.
  showSaveButton: boolean;
  onSaved: () => void;
  // The draft against accidental tab closing (§3.4) lives combined in `InvestigationStep`, under
  // the single `'investigation'` key of the state contract — this section never touches
  // `localStorage` directly. `draftValues` wins over `investigationSource` only on mount (same
  // criterion as FE12a's restoration); `onValuesChange` reports every change so the parent can
  // merge it with the other two sections and write it with a single 500ms debounce.
  draftValues?: InvestigationSourceFormValues;
  onValuesChange?: (values: InvestigationSourceFormValues) => void;
}

// Section 1 of step 5 (SPEC FE13a §3.5 B): the eight tri-state flags of `investigationSource`
// plus the text behind `other`. It's the shape of `VerificationSourceSection.tsx` with eight
// flags instead of six (§1 "Why this spec exists") — same `<Switch>` that's born untouched
// (`null`, not unchecked), same `aria-live` around the conditional block.
export function SourceSection({
  caseId,
  investigationId,
  investigationSource,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
}: SourceSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationSourceResource.useCreate();
  const update = investigationSourceResource.useUpdate();

  const form = useForm<InvestigationSourceFormValues>({
    resolver: zodResolver(investigationSourceSaveSchema) as Resolver<InvestigationSourceFormValues>,
    defaultValues: { ...buildDefaultValues(investigationSource), ...draftValues },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as InvestigationSourceFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const other = form.watch('other');
  const otherDescription = form.watch('otherDescription');
  const showsOtherDescription = other === true;
  const otherDescriptionCoherent = isOtherSourceDescriptionRequirementMet(other, otherDescription);

  async function handleValidSubmit(values: InvestigationSourceFormValues) {
    // Turning off "other source" clears the field and stops sending it (§3.5 B, §7.3): what's
    // never sent is the disabled source and the text at the same time, even if the hidden
    // textarea still holds something typed before hiding.
    const payload: InvestigationSourceFormValues =
      values.other === true ? values : { ...values, otherDescription: null };

    try {
      if (investigationSource) {
        await update.mutateAsync({ id: investigationId, data: payload });
        toast.success(t('common.toast.updated'));
      } else {
        await create.mutateAsync({ ...payload, investigationId });
        toast.success(t('common.toast.created'));
      }
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      // The 1:1 row already exists (§3.5 E): re-read instead of retrying the `POST` — duplicating
      // it isn't an option over a key that IS the `investigationId`.
      if (err.code === 'INVSRC_001_ALREADY_EXISTS') {
        await queryClient.invalidateQueries({ queryKey: investigationSourceByCaseKey(caseId) });
        toast.error(getErrorMessage(err));
        return;
      }
      if (
        err.code === 'INVSRC_001_OTHER_DESCRIPTION_REQUIRED' ||
        err.code === 'INVSRC_004_OTHER_DESCRIPTION_REQUIRED' ||
        err.code === 'INVSRC_001_OTHER_DESCRIPTION_NOT_ALLOWED' ||
        err.code === 'INVSRC_004_OTHER_DESCRIPTION_NOT_ALLOWED'
      ) {
        form.setError('otherDescription', { type: 'server', message: err.message });
        return;
      }
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.source.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('investigation.source.intro')}</p>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="sr-only">{t('investigation.source.legend')}</legend>
        {SOURCE_SWITCHES.map(({ name, labelKey }) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    // Turning off "other source" clears the field right there (§3.5 B) —
                    // validating against text still present would block a legitimate save.
                    if (name === 'other' && !checked) {
                      form.setValue('otherDescription', null, { shouldValidate: true });
                    }
                  }}
                  disabled={disabled}
                  aria-label={t(labelKey)}
                />
                {t(labelKey)}
              </label>
            )}
          />
        ))}
      </fieldset>

      {/* Visible only when `other === true` (§3.5 B) — appears due to a change in another control. */}
      <div aria-live="polite">
        {showsOtherDescription && (
          <Controller
            control={form.control}
            name="otherDescription"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="investigationSource-otherDescription"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.source.otherDescription')}
                </label>
                <Textarea
                  id="investigationSource-otherDescription"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={disabled}
                />
                {!otherDescriptionCoherent && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('investigation.source.otherDescriptionRequired')}
                  </p>
                )}
              </div>
            )}
          />
        )}
      </div>

      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="investigationSource-notes"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.fields.notes')}
            </label>
            <Textarea
              id="investigationSource-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={disabled}
            />
          </div>
        )}
      />

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={disabled || create.isPending || update.isPending}
          onClick={() => void form.handleSubmit(handleValidSubmit)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
