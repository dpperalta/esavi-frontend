import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  isPregnancyDescriptionRequirementMet,
  type NotificationFormValues,
  type PregnancyGateState,
} from '@/features/notification/schemas';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Textarea } from '@/shared/components/ui/textarea';

export interface SevereNotificationFieldsProps {
  control: Control<NotificationFormValues>;
  pregnancyGate: PregnancyGateState;
  hasPregnancyComplications: 'YES' | 'NO' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'NO_ANSWER' | null | undefined;
  pregnancyComplicationsDescription: string | null | undefined;
  // La derivación de §6.5, mitad de la ficha grave (SPEC FE12d §4 paso 11): «derivado en render,
  // no es estado» — bloquea el campo en `'YES'` sin escribirlo en el formulario.
  complicationsDerived: boolean;
}

// La ficha grave (SPEC FE12a §3.5), extraída para no inflar `NotificationStep.tsx`. Los dos
// campos de embarazo, detrás de la compuerta de `CASE-PROCESS.md` §7.4: `pregnancyGate ===
// 'hidden'` no pinta ni siquiera el contenedor — «ningún campo de embarazo existe en el DOM», no
// sólo oculto (SPEC FE12a §5).
export function SevereNotificationFields({
  control,
  pregnancyGate,
  hasPregnancyComplications,
  pregnancyComplicationsDescription,
  complicationsDerived,
}: SevereNotificationFieldsProps) {
  const { t } = useTranslation();
  const effectiveHasPregnancyComplications = complicationsDerived ? 'YES' : hasPregnancyComplications;
  const showsPregnancyDescription = effectiveHasPregnancyComplications === 'YES';
  const pregnancyDescriptionCoherent = isPregnancyDescriptionRequirementMet(
    effectiveHasPregnancyComplications,
    pregnancyComplicationsDescription,
  );

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

      {pregnancyGate !== 'hidden' && (
        <div className="flex flex-col gap-1.5">
          {pregnancyGate === 'visibleIfApplicable' && (
            <span className="text-xs text-muted-foreground">{t('notification.pregnancy.ifApplicable')}</span>
          )}
          <span className="text-sm font-medium text-foreground">
            {t('notification.severe.hasPregnancyComplications')}
          </span>
          <Controller
            control={control}
            name="hasPregnancyComplications"
            render={({ field }) => (
              <AnswerOptionField
                value={complicationsDerived ? 'YES' : (field.value ?? null)}
                onChange={field.onChange}
                ariaLabel={t('notification.severe.hasPregnancyComplications')}
                variant="unknown"
                disabled={complicationsDerived}
              />
            )}
          />
          {/* §6.5: mismo texto que el bloque de embarazo, compartido entre las dos mitades de la
              derivación (§3.8 "compartida por los dos campos"). */}
          {complicationsDerived && (
            <p className="text-sm text-muted-foreground">{t('notification.pregnancy.derived.hasComplications')}</p>
          )}

          {/* Visible sólo con hasPregnancyComplications === 'YES' (SPEC FE12a §3.5, §7) — mismo
              motivo de aria-live que las otras dos secciones condicionales. */}
          <div aria-live="polite">
            {showsPregnancyDescription && (
              <Controller
                control={control}
                name="pregnancyComplicationsDescription"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="severeNotification-pregnancyComplicationsDescription"
                      className="text-sm font-medium text-foreground"
                    >
                      {t('notification.severe.pregnancyComplicationsDescription')}
                    </label>
                    <Textarea
                      id="severeNotification-pregnancyComplicationsDescription"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    />
                    {!pregnancyDescriptionCoherent && (
                      <p role="alert" className="text-sm text-destructive">
                        {t('notification.validation.pregnancyDescriptionRequired')}
                      </p>
                    )}
                  </div>
                )}
              />
            )}
          </div>
        </div>
      )}

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
