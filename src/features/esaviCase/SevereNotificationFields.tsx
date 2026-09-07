import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { NotificationFormValues } from '@/features/notification/schemas';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Textarea } from '@/shared/components/ui/textarea';

export interface SevereNotificationFieldsProps {
  control: Control<NotificationFormValues>;
}

// La ficha grave (SPEC FE12a §3.5), extraída para no inflar `NotificationStep.tsx`. Los dos
// campos de embarazo — `hasPregnancyComplications` y `pregnancyComplicationsDescription` — no
// están aquí todavía: cuelgan de la compuerta de §7.4, que es SPEC FE12a §4 paso 13.
export function SevereNotificationFields({ control }: SevereNotificationFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">{t('notification.severe.sectionTitle')}</span>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.severe.hasPreviousEventHistory')}
          </span>
          <Controller
            control={control}
            name="hasPreviousEventHistory"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.severe.hasPreviousEventHistory')}
                variant="unknown"
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.severe.hasAllergyToOtherVaccines')}
          </span>
          <Controller
            control={control}
            name="hasAllergyToOtherVaccines"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.severe.hasAllergyToOtherVaccines')}
                variant="unknown"
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.severe.hasAllergyToMedications')}
          </span>
          <Controller
            control={control}
            name="hasAllergyToMedications"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.severe.hasAllergyToMedications')}
                variant="unknown"
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.severe.hasAllergyToPreviousSameVaccine')}
          </span>
          <Controller
            control={control}
            name="hasAllergyToPreviousSameVaccine"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.severe.hasAllergyToPreviousSameVaccine')}
                variant="unknown"
              />
            )}
          />
        </div>
      </div>

      <Controller
        control={control}
        name="severeNotes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="severeNotification-notes" className="text-sm font-medium text-foreground">
              {t('notification.fields.notes')}
            </label>
            <Textarea
              id="severeNotification-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
            />
          </div>
        )}
      />
    </div>
  );
}
