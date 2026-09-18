import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import { investigationResource } from '@/features/investigation/api';
import {
  otherFindingsSaveSchema,
  type InvestigationSectionHandle,
  type OtherFindingsFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(investigation: InvestigationDetail | null): OtherFindingsFormValues {
  return { notes: investigation?.notes ?? null };
}

export interface OtherFindingsSectionProps {
  investigationId: string;
  investigation: InvestigationDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: OtherFindingsFormValues;
  onValuesChange?: (values: OtherFindingsFormValues) => void;
  onRegisterHandle?: (handle: InvestigationSectionHandle | null) => void;
}

// Section H of step 5 (SPEC FE13e §3.5 E, §3.6): `investigation.notes`, moved here from A1 (§8).
// Writes against the header with `ESAVI-INVESTGN-004`, through `investigationResource.useUpdate`
// — the factory's own invalidation (`createResource.ts`) already scopes to `['investigation']`
// and never touches `['investigationAdministrationError']`/`['investigationCommunity']`, so no
// hand-written invalidation is needed here. Its own `useForm`, separate from `BasicInfoSection`'s
// (§3.5 E): the header is one entity written by two independent forms, each owning its own
// columns — A1 never renders `notes` again after this spec (§8), and this form never renders any
// of A1's fields.
export function OtherFindingsSection({
  investigationId,
  investigation,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
  onRegisterHandle,
}: OtherFindingsSectionProps) {
  const { t } = useTranslation();
  const update = investigationResource.useUpdate();

  const form = useForm<OtherFindingsFormValues>({
    resolver: zodResolver(otherFindingsSaveSchema) as Resolver<OtherFindingsFormValues>,
    defaultValues: { ...buildDefaultValues(investigation), ...draftValues },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as OtherFindingsFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  async function handleSave(values: OtherFindingsFormValues) {
    try {
      await update.mutateAsync({ id: investigationId, data: values });
      toast.success(t('common.toast.updated'));
      form.reset(values);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      toast.error(getErrorMessage(err));
    }
  }

  const performSaveRef = useRef(() => form.handleSubmit(handleSave)());
  performSaveRef.current = () => form.handleSubmit(handleSave)();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onRegisterHandle?.({ save: () => performSaveRef.current(), isDirty });
    return () => onRegisterHandle?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterHandle, isDirty]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.otherFindings.title')}
      </h3>

      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="otherFindings-notes" className="text-sm font-medium text-foreground">
              {t('investigation.fields.notes')}
            </label>
            <Textarea
              id="otherFindings-notes"
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
          disabled={disabled || update.isPending}
          onClick={() => void form.handleSubmit(handleSave)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
