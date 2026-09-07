import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { NotificationFormValues } from '@/features/notification/schemas';
import { isOtherSourceDescriptionRequirementMet } from '@/features/notification/schemas';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { HealthFacilitySelect } from './HealthFacilitySelect';

export interface NonSevereNotificationFieldsProps {
  control: Control<NotificationFormValues>;
  // Nombre resuelto de la unidad de vacunación en reentrada (§3.3: la respuesta trae el objeto
  // `vaccinationHealthFacility`, no sólo el id) — el mismo patrón que `CaseOpeningStep` usa para
  // su propia unidad de salud.
  initialHealthFacilityLabel: string | null;
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

// La ficha no grave (SPEC FE12a §3.5), extraída por la misma razón que `SevereNotificationFields`.
// `vaccinationHealthFacilityId` usa `scoped={false}` a propósito (§3.5 "sin filtro de cobertura"):
// el backend sólo comprueba `isActive` en esta columna, nunca la cobertura geográfica del usuario.
export function NonSevereNotificationFields({
  control,
  initialHealthFacilityLabel,
  verifiedOtherSource,
  otherSourceDescription,
}: NonSevereNotificationFieldsProps) {
  const { t } = useTranslation();
  const [selectedFacilityLabel, setSelectedFacilityLabel] = useState<string | null>(null);
  const showsOtherSourceDescription = verifiedOtherSource === true;
  const otherSourceDescriptionCoherent = isOtherSourceDescriptionRequirementMet(
    verifiedOtherSource,
    otherSourceDescription,
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">{t('notification.nonSevere.sectionTitle')}</span>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('notification.nonSevere.vaccinationHealthFacilityId')}
        </span>
        <Controller
          control={control}
          name="vaccinationHealthFacilityId"
          render={({ field }) => (
            <HealthFacilitySelect
              value={field.value ?? null}
              resolvedLabel={initialHealthFacilityLabel ?? selectedFacilityLabel}
              scoped={false}
              onChange={(option) => {
                field.onChange(option?.id ?? null);
                setSelectedFacilityLabel(option?.label ?? null);
              }}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('notification.nonSevere.vaccinationSiteItemId')}
        </span>
        <Controller
          control={control}
          name="vaccinationSiteItemId"
          render={({ field }) => (
            <CatalogSelect
              typeCode="vaccinationSite"
              emit="id"
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('notification.nonSevere.vaccinationSiteItemId')}
            />
          )}
        />
      </div>

      <Controller
        control={control}
        name="vaccinationCenterAddress"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nonSevere-vaccinationCenterAddress" className="text-sm font-medium text-foreground">
              {t('notification.nonSevere.vaccinationCenterAddress')}
            </label>
            <Input
              id="nonSevere-vaccinationCenterAddress"
              maxLength={250}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
            />
          </div>
        )}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('notification.nonSevere.vaccinationGeoLocationId')}
        </span>
        <Controller
          control={control}
          name="vaccinationGeoLocationId"
          render={({ field }) => <GeoLocationPicker value={field.value ?? null} onChange={field.onChange} />}
        />
      </div>

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
                <Switch checked={field.value === true} onCheckedChange={field.onChange} aria-label={t(labelKey)} />
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
                <label htmlFor="nonSevere-otherSourceDescription" className="text-sm font-medium text-foreground">
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
            <label htmlFor="nonSevereNotification-notes" className="text-sm font-medium text-foreground">
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
