import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { NotificationFormValues } from '@/features/notification/schemas';
import { isOtherSourceDescriptionRequirementMet } from '@/features/notification/schemas';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

export interface VerificationSourceSectionProps {
  control: Control<NotificationFormValues>;
  verifiedOtherSource: boolean | null | undefined;
  otherSourceDescription: string | null | undefined;
}

const VERIFICATION_SWITCHES = [
  { name: 'verifiedPhysicalDocument', labelKey: 'notification.nonSevere.verifiedPhysicalDocument' },
  { name: 'verifiedElectronicRecord', labelKey: 'notification.nonSevere.verifiedElectronicRecord' },
  { name: 'verifiedVerbalReport', labelKey: 'notification.nonSevere.verifiedVerbalReport' },
  { name: 'verifiedClinicalRecord', labelKey: 'notification.nonSevere.verifiedClinicalRecord' },
  { name: 'verifiedUnknown', labelKey: 'notification.nonSevere.verifiedUnknown' },
  { name: 'verifiedOtherSource', labelKey: 'notification.nonSevere.verifiedOtherSource' },
] as const;

// Section 6 of the non-severe branch (SPEC FE12e §3.1), the other half of the dissolved
// `NonSevereNotificationFields`: the six verification sources, the free text behind
// `verifiedOtherSource` and the branch notes that close the section.
export function VerificationSourceSection({
  control,
  verifiedOtherSource,
  otherSourceDescription,
}: VerificationSourceSectionProps) {
  const { t } = useTranslation();
  const showsOtherSourceDescription = verifiedOtherSource === true;
  const otherSourceDescriptionCoherent = isOtherSourceDescriptionRequirementMet(
    verifiedOtherSource,
    otherSourceDescription,
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t('notification.nonSevere.verificationLegend')}
        </legend>
        {VERIFICATION_SWITCHES.map(({ name, labelKey }) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({ field }) => (
              <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={field.value === true}
                  onCheckedChange={field.onChange}
                  aria-label={t(labelKey)}
                />
                {t(labelKey)}
              </label>
            )}
          />
        ))}
      </fieldset>

      {/* Visible sólo con `verifiedOtherSource === true` (SPEC FE12a §3.5, §7) — mismo motivo de
          `aria-live` que la sección de fallecimiento: aparece por un cambio en otro control. */}
      <div aria-live="polite">
        {showsOtherSourceDescription && (
          <Controller
            control={control}
            name="otherSourceDescription"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="nonSevere-otherSourceDescription"
                  className="text-sm font-medium text-foreground"
                >
                  {t('notification.nonSevere.otherSourceDescription')}
                </label>
                <Textarea
                  id="nonSevere-otherSourceDescription"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
                {!otherSourceDescriptionCoherent && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('notification.validation.otherSourceDescriptionRequired')}
                  </p>
                )}
              </div>
            )}
          />
        )}
      </div>

      <Controller
        control={control}
        name="nonSevereNotes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="nonSevereNotification-notes"
              className="text-sm font-medium text-foreground"
            >
              {t('notification.fields.notes')}
            </label>
            <Textarea
              id="nonSevereNotification-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
            />
          </div>
        )}
      />
    </div>
  );
}
