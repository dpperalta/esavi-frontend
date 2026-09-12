import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { NotificationDetail } from '@/contracts/declared/notification';
import { AutopsyFields } from '@/features/investigation/AutopsyFields';
import { geoLocationResource } from '@/features/geoLocation/api';
import {
  investigationAutopsyByCaseKey,
  investigationAutopsyResource,
  investigationResource,
} from '@/features/investigation/api';
import {
  investigationAutopsySaveSchema,
  investigationSaveSchema,
  type InvestigationAutopsyFormValues,
  type InvestigationFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { HealthFacilitySelect } from '@/shared/components/HealthFacilitySelect';
import { MapPointPicker, type LatLng } from '@/shared/components/MapPointPicker';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(investigation: InvestigationDetail | null): InvestigationFormValues {
  return {
    statusItemId: investigation?.status?.catalogItemId ?? null,
    vaccinationSiteItemId: investigation?.vaccinationSite?.catalogItemId ?? null,
    vaccinationHealthFacilityId: investigation?.vaccinationHealthFacility?.healthFacilityId ?? null,
    vaccinationGeoLocationId: investigation?.vaccinationGeoLocation?.geoLocationId ?? null,
    hospitalizationDate: investigation?.hospitalizationDate ?? null,
    investigationStartDate: investigation?.investigationStartDate ?? null,
    vaccinationLatitude: investigation?.vaccinationLatitude != null ? Number(investigation.vaccinationLatitude) : null,
    vaccinationLongitude: investigation?.vaccinationLongitude != null ? Number(investigation.vaccinationLongitude) : null,
    notes: investigation?.notes ?? null,
  };
}

// SPEC FE13a §3.4: `deathDate` is preloaded once, when building `defaultValues`, and from there
// it's RHF's. The autopsy `GET` overrides the preload as soon as the row exists — it only falls
// back to `notification.deathDate` while there's no own row yet.
function buildAutopsyDefaultValues(
  autopsy: InvestigationAutopsyDetail | null,
  notificationDeathDate: string | null,
): InvestigationAutopsyFormValues {
  return {
    isDeath: true,
    deathDate: autopsy?.deathDate ?? notificationDeathDate ?? '',
    // The `GET` returns `HH:mm:ss` (contracts/declared/investigationAutopsy.ts); the schema and
    // `<TimeField>` speak `HH:mm` — trimmed here, the single mapping spot.
    deathTime: autopsy?.deathTime ? autopsy.deathTime.slice(0, 5) : null,
    isAutopsyPerformed: autopsy?.isAutopsyPerformed ?? null,
    autopsyDate: autopsy?.autopsyDate ?? null,
    isAutopsyScheduled: autopsy?.isAutopsyScheduled ?? null,
    scheduledAutopsyDate: autopsy?.scheduledAutopsyDate ?? null,
    autopsyComments: autopsy?.autopsyComments ?? null,
    notes: autopsy?.notes ?? null,
  };
}

export interface BasicInfoSectionProps {
  caseId: string;
  investigationId: string;
  investigation: InvestigationDetail | null;
  investigationAutopsy: InvestigationAutopsyDetail | null;
  // Only for `deathDate` preload and the §6.6 warning — read, never duplicated (§3.4).
  notification: NotificationDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  // Same combined mechanism as `SourceSection` (§3.4): `InvestigationStep` merges the three
  // sections under the single `'investigation'` draft key; this one never touches `localStorage`.
  draftValues?: {
    basicInfo: InvestigationFormValues;
    autopsy: InvestigationAutopsyFormValues;
  };
  onValuesChange?: (values: {
    basicInfo: InvestigationFormValues;
    autopsy: InvestigationAutopsyFormValues;
  }) => void;
}

// Section A1 of step 5 (SPEC FE13a §3.5 A and C): the ten columns of `investigation` plus, inside
// the same block, the nine of `investigationAutopsy` when the status resolves to `DEATH`. Just as
// self-contained as `SourceSection` — a single "Guardar y continuar" — but here that button writes
// two tables (§3.6: "the header's PUT and, if the death block is visible, the POST/PUT of
// investigationAutopsy"), with two independent RHF forms because they're two schemas and two
// different entities.
export function BasicInfoSection({
  caseId,
  investigationId,
  investigation,
  investigationAutopsy,
  notification,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
}: BasicInfoSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const update = investigationResource.useUpdate();
  const autopsyCreate = investigationAutopsyResource.useCreate();
  const autopsyUpdate = investigationAutopsyResource.useUpdate();
  const statusItems = useCatalogItemsByTypeCode('investigationStatus');
  // Resolved on re-entry (§3.3: the response carries the `vaccinationHealthFacility` object, not
  // just the id) — same pattern as `VaccinationBackgroundSection`.
  const [selectedFacilityLabel, setSelectedFacilityLabel] = useState<string | null>(null);
  // "Dismissed for this session" (§3.4): reappears on reload, deliberately.
  const [deathWarningDismissed, setDeathWarningDismissed] = useState(false);

  const form = useForm<InvestigationFormValues>({
    resolver: zodResolver(investigationSaveSchema) as Resolver<InvestigationFormValues>,
    defaultValues: { ...buildDefaultValues(investigation), ...draftValues?.basicInfo },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const autopsyForm = useForm<InvestigationAutopsyFormValues>({
    resolver: zodResolver(investigationAutopsySaveSchema) as Resolver<InvestigationAutopsyFormValues>,
    defaultValues: {
      ...buildAutopsyDefaultValues(investigationAutopsy, notification?.deathDate ?? null),
      ...draftValues?.autopsy,
    },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedBasicInfo = useWatch({ control: form.control }) as InvestigationFormValues;
  const watchedAutopsy = useWatch({ control: autopsyForm.control }) as InvestigationAutopsyFormValues;
  useEffect(() => {
    onValuesChange?.({ basicInfo: watchedBasicInfo, autopsy: watchedAutopsy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBasicInfo, watchedAutopsy]);

  const statusItemId = form.watch('statusItemId');
  const vaccinationGeoLocationId = form.watch('vaccinationGeoLocationId');
  const vaccinationLatitude = form.watch('vaccinationLatitude');
  const vaccinationLongitude = form.watch('vaccinationLongitude');
  const autopsyDeathDate = autopsyForm.watch('deathDate');

  // The death block's gate checks `status.value`, never `code` or `name` (SPEC FE13a §6,
  // decision), and is derived in render — there's no `showAutopsy` flag anywhere.
  const isDeath =
    statusItems.rows.find((row) => row.catalogItemId === statusItemId)?.value === 'DEATH';

  // §6.6 warning (CASE-PROCESS.md): only once the notification has loaded — "staying silent is
  // correct; warning about an unverified divergence is not" — and only while the death block is
  // visible. It never blocks, never propagates anything.
  // When the death block hides, `<AutopsyFields>` unmounts and its own `<Switch>` controls can't
  // clear anything — the cleanup lives here, in whatever triggers the hide. It never touches
  // `deathDate` (not nullable, §3.5 C) nor `notes` (doesn't depend on any flag).
  const wasDeathRef = useRef(isDeath);
  useEffect(() => {
    if (wasDeathRef.current && !isDeath) {
      autopsyForm.setValue('deathTime', null, { shouldDirty: true });
      autopsyForm.setValue('isAutopsyPerformed', null, { shouldDirty: true });
      autopsyForm.setValue('autopsyDate', null, { shouldDirty: true });
      autopsyForm.setValue('isAutopsyScheduled', null, { shouldDirty: true });
      autopsyForm.setValue('scheduledAutopsyDate', null, { shouldDirty: true });
      autopsyForm.setValue('autopsyComments', null, { shouldDirty: true });
    }
    wasDeathRef.current = isDeath;
  }, [isDeath, autopsyForm]);

  const outcomeIsDeath = notification?.outcome?.value === 'DEATH';
  const notificationDeathDate = notification?.deathDate ?? null;
  const showsDeathWarning =
    isDeath &&
    notification !== null &&
    !deathWarningDismissed &&
    (!outcomeIsDeath || notificationDeathDate !== autopsyDeathDate);

  // The map's initial center, derived from the chosen `geoLocation` (§3.7) — never the browser's
  // geolocation. Only used while there's no own point yet (`value === null`).
  const geoLocation = geoLocationResource.useOne(vaccinationGeoLocationId ?? '');
  const fallbackCenter: LatLng | undefined =
    geoLocation.data?.latitude != null && geoLocation.data?.longitude != null
      ? { lat: geoLocation.data.latitude, lng: geoLocation.data.longitude }
      : undefined;

  const mapValue: LatLng | null =
    vaccinationLatitude != null && vaccinationLongitude != null
      ? { lat: vaccinationLatitude, lng: vaccinationLongitude }
      : null;

  function handleMapChange(next: LatLng | null) {
    form.setValue('vaccinationLatitude', next?.lat ?? null, { shouldDirty: true });
    form.setValue('vaccinationLongitude', next?.lng ?? null, { shouldDirty: true, shouldValidate: true });
  }

  async function handleSave() {
    const investigationValid = await form.trigger();
    // Without an autopsy row and without `DEATH`, there's nothing to write or clear (§3.5 C: "an
    // autopsy row only exists over a death"). With an existing row, changing the status to a
    // non-death one still writes — that's the acceptance criterion's cleanup.
    const shouldWriteAutopsy = isDeath || investigationAutopsy !== null;
    const autopsyValid = shouldWriteAutopsy ? await autopsyForm.trigger() : true;
    if (!investigationValid || !autopsyValid) {
      return;
    }

    const values = form.getValues();
    try {
      await update.mutateAsync({ id: investigationId, data: values });
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      // The chosen item got deactivated while the screen was open (§3.5 E) — the operation number
      // between `STATUS` and `NOT_FOUND` isn't fixed in the spec, so it's compared by suffix,
      // same as `isRefreshTokenReused` in `client.ts`.
      if (err.code.endsWith('_STATUS_NOT_FOUND')) {
        form.setError('statusItemId', { type: 'server', message: err.message });
        return;
      }
      if (err.code.endsWith('_DEFAULT_STATUS_MISSING')) {
        // An unseeded deployment, not a user error (§3.5 E) — named as such instead of a generic
        // toast.
        toast.error(t('investigation.error.defaultStatusMissing'));
        return;
      }
      toast.error(getErrorMessage(err));
      return;
    }
    form.reset(values);

    if (shouldWriteAutopsy) {
      // If the block got hidden, `autopsyForm` already carries its fields as `null` since the
      // matching `<Switch>` cleared them on toggle — this `PUT` persists them without deleting
      // the row (§3.5 C, acceptance criterion).
      const autopsyValues = autopsyForm.getValues();
      try {
        if (investigationAutopsy) {
          await autopsyUpdate.mutateAsync({ id: investigationId, data: autopsyValues });
        } else {
          await autopsyCreate.mutateAsync({ ...autopsyValues, investigationId });
        }
        autopsyForm.reset(autopsyValues);
      } catch (err) {
        if (!(err instanceof EsaviApiError)) {
          throw err;
        }
        // The 1:1 row already exists (§3.5 E): re-read instead of retrying the `POST`.
        if (err.code === 'INVAUT_001_ALREADY_EXISTS') {
          await queryClient.invalidateQueries({ queryKey: investigationAutopsyByCaseKey(caseId) });
          toast.error(getErrorMessage(err));
          return;
        }
        // Comparison order matters: `..._SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED` also ends in
        // `..._AUTOPSY_DATE_NOT_ALLOWED`, so the more specific variant goes first.
        if (err.code.endsWith('_SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED')) {
          autopsyForm.setError('scheduledAutopsyDate', { type: 'server', message: err.message });
          return;
        }
        if (err.code.endsWith('_AUTOPSY_DATE_NOT_ALLOWED')) {
          autopsyForm.setError('autopsyDate', { type: 'server', message: err.message });
          return;
        }
        if (err.code.endsWith('_AUTOPSY_FLAGS_EXCLUSIVE')) {
          autopsyForm.setError('isAutopsyScheduled', { type: 'server', message: err.message });
          return;
        }
        if (err.code.endsWith('_AUTOPSY_DATE_BEFORE_DEATH')) {
          // The error anchors on both dates at once (§3.5 C).
          autopsyForm.setError('deathDate', { type: 'server', message: err.message });
          autopsyForm.setError('autopsyDate', { type: 'server', message: err.message });
          return;
        }
        toast.error(getErrorMessage(err));
        return;
      }
    }

    toast.success(t('common.toast.updated'));
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.basicInfo.title')}
      </h3>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.basicInfo.statusItemId')}
        </span>
        <Controller
          control={form.control}
          name="statusItemId"
          render={({ field }) => (
            <CatalogSelect
              typeCode="investigationStatus"
              emit="id"
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.basicInfo.statusItemId')}
              disabled={disabled}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.basicInfo.vaccinationSiteItemId')}
        </span>
        <Controller
          control={form.control}
          name="vaccinationSiteItemId"
          render={({ field }) => (
            <CatalogSelect
              typeCode="vaccinationSite"
              emit="id"
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.basicInfo.vaccinationSiteItemId')}
              disabled={disabled}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.basicInfo.vaccinationHealthFacilityId')}
        </span>
        <Controller
          control={form.control}
          name="vaccinationHealthFacilityId"
          render={({ field }) => (
            <HealthFacilitySelect
              value={field.value ?? null}
              resolvedLabel={
                investigation?.vaccinationHealthFacility?.name ?? selectedFacilityLabel
              }
              // Only checks `isActive` (§3.5 A): unlike step 2, this column doesn't validate
              // geographic scope.
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
          {t('investigation.basicInfo.vaccinationGeoLocationId')}
        </span>
        <Controller
          control={form.control}
          name="vaccinationGeoLocationId"
          render={({ field }) => (
            <GeoLocationPicker value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.basicInfo.mapLabel')}
        </span>
        <MapPointPicker
          value={mapValue}
          onChange={handleMapChange}
          fallbackCenter={fallbackCenter}
          disabled={disabled}
          ariaLabel={t('investigation.basicInfo.mapLabel')}
        />
      </div>

      <Controller
        control={form.control}
        name="hospitalizationDate"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('investigation.basicInfo.hospitalizationDate')}
            </span>
            <DateField
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.basicInfo.hospitalizationDate')}
              allowFuture={false}
              disabled={disabled}
            />
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="investigationStartDate"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('investigation.basicInfo.investigationStartDate')}
            </span>
            <DateField
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.basicInfo.investigationStartDate')}
              allowFuture={false}
              disabled={disabled}
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
              htmlFor="investigation-basicInfo-notes"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.fields.notes')}
            </label>
            <Textarea
              id="investigation-basicInfo-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={disabled}
            />
          </div>
        )}
      />

      {/* Block 6.1–6.7, visible only when `status.value === 'DEATH'` (§3.5 C) — appears due to a
        change in the `<CatalogSelect>` above. */}
      <div aria-live="polite">
        {isDeath && (
          <AutopsyFields
            form={autopsyForm}
            disabled={disabled}
            showsDeathWarning={showsDeathWarning}
            onDismissDeathWarning={() => setDeathWarningDismissed(true)}
            wizardStepFourPath={`/esavi-cases/${caseId}/wizard/notification`}
          />
        )}
      </div>

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={disabled || update.isPending || autopsyCreate.isPending || autopsyUpdate.isPending}
          onClick={() => void handleSave()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
