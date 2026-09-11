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

// SPEC FE13a §3.4: `deathDate` se precarga una vez, al construir `defaultValues`, y desde ahí es
// de RHF. El `GET` de autopsia manda sobre la precarga en cuanto la fila existe — sólo cae a
// `notification.deathDate` mientras no hay fila propia todavía.
function buildAutopsyDefaultValues(
  autopsy: InvestigationAutopsyDetail | null,
  notificationDeathDate: string | null,
): InvestigationAutopsyFormValues {
  return {
    isDeath: true,
    deathDate: autopsy?.deathDate ?? notificationDeathDate ?? '',
    // El `GET` devuelve `HH:mm:ss` (contracts/declared/investigationAutopsy.ts); el schema y
    // `<TimeField>` hablan `HH:mm` — se recorta aquí, en el único sitio del mapeo.
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
  // Sólo para la precarga de `deathDate` y el aviso de §6.6 — se lee, no se duplica (§3.4).
  notification: NotificationDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  // Mismo mecanismo combinado que `SourceSection` (§3.4): `InvestigationStep` junta las tres
  // secciones bajo la única clave `'investigation'` del borrador, esta no toca `localStorage`.
  draftValues?: {
    basicInfo: InvestigationFormValues;
    autopsy: InvestigationAutopsyFormValues;
  };
  onValuesChange?: (values: {
    basicInfo: InvestigationFormValues;
    autopsy: InvestigationAutopsyFormValues;
  }) => void;
}

// Sección A1 del paso 5 (SPEC FE13a §3.5 A y C): las diez columnas de `investigation` más, dentro
// del mismo bloque, las nueve de `investigationAutopsy` cuando el estado resuelve a `DEATH`. Sigue
// autocontenida como `SourceSection` — un único "Guardar y continuar" — pero aquí ese botón escribe
// dos tablas (§3.6: "el PUT de la cabecera y, si el bloque de muerte está visible, el POST/PUT de
// investigationAutopsy"), con dos formularios de RHF independientes porque son dos schemas y dos
// entidades distintas.
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
  // Resuelto por reentrada (§3.3: la respuesta trae el objeto `vaccinationHealthFacility`, no
  // sólo el id) — mismo patrón que `VaccinationBackgroundSection`.
  const [selectedFacilityLabel, setSelectedFacilityLabel] = useState<string | null>(null);
  // "Descartado en esta sesión" (§3.4): vuelve a aparecer al recargar, a propósito.
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

  // La compuerta del bloque de muerte va contra `status.value`, nunca contra `code` ni `name`
  // (SPEC FE13a §6, decisión) y se deriva en render — no hay una bandera `showAutopsy` en ningún
  // sitio.
  const isDeath =
    statusItems.rows.find((row) => row.catalogItemId === statusItemId)?.value === 'DEATH';

  // Aviso de §6.6 (CASE-PROCESS.md): sólo con la notificación ya cargada — "callar es correcto;
  // avisar de una divergencia que no se ha comprobado, no" — y sólo mientras el bloque de muerte
  // está visible. No bloquea, no propaga nada.
  // Al ocultarse el bloque de muerte, `<AutopsyFields>` deja de estar montado y sus propios
  // `<Switch>` no pueden limpiar nada — la limpieza vive aquí, en lo que dispara el cierre. No
  // toca `deathDate` (no anulable, §3.5 C) ni `notes` (no depende de ninguna bandera).
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

  // El centro inicial del mapa, derivado del `geoLocation` elegido (§3.7) — nunca geolocalización
  // del navegador. Sólo se usa mientras no hay un punto propio todavía (`value === null`).
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
    // Sin fila de autopsia y sin `DEATH`, no hay nada que escribir ni que limpiar (§3.5 C: "una
    // fila de autopsia sólo existe sobre una muerte"). Con fila ya existente, cambiar el estado a
    // uno que no es muerte sigue escribiendo — es la limpieza del criterio de aceptación.
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
      // El ítem elegido se desactivó mientras la pantalla estaba abierta (§3.5 E) — el número de
      // operación entre `STATUS` y `NOT_FOUND` no está fijado en el spec, así que se compara por
      // sufijo, igual que `isRefreshTokenReused` en `client.ts`.
      if (err.code.endsWith('_STATUS_NOT_FOUND')) {
        form.setError('statusItemId', { type: 'server', message: err.message });
        return;
      }
      if (err.code.endsWith('_DEFAULT_STATUS_MISSING')) {
        // Despliegue sin sembrar, no un error del usuario (§3.5 E) — se nombra como tal en vez
        // de un toast genérico.
        toast.error(t('investigation.error.defaultStatusMissing'));
        return;
      }
      toast.error(getErrorMessage(err));
      return;
    }
    form.reset(values);

    if (shouldWriteAutopsy) {
      // Si el bloque se ocultó, `autopsyForm` ya trae sus campos en `null` desde que el
      // `<Switch>` correspondiente los limpió al tocarse — este `PUT` los persiste sin borrar la
      // fila (§3.5 C, criterio de aceptación).
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
        // La fila 1:1 ya existe (§3.5 E): relee en vez de reintentar el `POST`.
        if (err.code === 'INVAUT_001_ALREADY_EXISTS') {
          await queryClient.invalidateQueries({ queryKey: investigationAutopsyByCaseKey(caseId) });
          toast.error(getErrorMessage(err));
          return;
        }
        // El orden de las comparaciones importa: `..._SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED` también
        // termina en `..._AUTOPSY_DATE_NOT_ALLOWED`, así que la variante más específica va primero.
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
          // El error se ancla en las dos fechas a la vez (§3.5 C).
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
              // Sólo comprueba `isActive` (§3.5 A): a diferencia del paso 2, esta columna no
              // valida alcance geográfico.
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

      {/* Bloque 6.1–6.7, visible sólo con `status.value === 'DEATH'` (§3.5 C) — aparece por un
        cambio en el propio `<CatalogSelect>` de arriba. */}
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
