import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { NotificationFormValues } from '@/features/notification/schemas';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { Input } from '@/shared/components/ui/input';
import { HealthFacilitySelect } from './HealthFacilitySelect';

export interface VaccinationBackgroundSectionProps {
  control: Control<NotificationFormValues>;
  // Nombre resuelto de la unidad de vacunación en reentrada (§3.3: la respuesta trae el objeto
  // `vaccinationHealthFacility`, no sólo el id) — el mismo patrón que `CaseOpeningStep` usa para
  // su propia unidad de salud.
  initialHealthFacilityLabel: string | null;
}

// Section 5 of the non-severe branch (SPEC FE12e §3.1), one of the two halves of the dissolved
// `NonSevereNotificationFields`. `vaccinationHealthFacilityId` usa `scoped={false}` a propósito
// (SPEC FE12a §3.5 "sin filtro de cobertura"): el backend sólo comprueba `isActive` en esta
// columna, nunca la cobertura geográfica del usuario.
export function VaccinationBackgroundSection({
  control,
  initialHealthFacilityLabel,
}: VaccinationBackgroundSectionProps) {
  const { t } = useTranslation();
  const [selectedFacilityLabel, setSelectedFacilityLabel] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        {t('notification.nonSevere.sectionTitle')}
      </span>

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
            <label
              htmlFor="nonSevere-vaccinationCenterAddress"
              className="text-sm font-medium text-foreground"
            >
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
          render={({ field }) => (
            <GeoLocationPicker value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      </div>
    </div>
  );
}
