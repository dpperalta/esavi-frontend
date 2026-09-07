import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { MeddraSearchField } from '@/shared/components/MeddraSearchField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { TimeField } from '@/shared/components/TimeField';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { notificationEventResource, useMeddraSearch } from './api';
import {
  notificationEventErrorFieldMap,
  notificationEventSchema,
  type NotificationEventFormValues,
} from './schemas';

export interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationId: string;
  // `null` significa «crear» — mismo precedente que `NotifierFormDialog`.
  eventId: string | null;
}

// SPEC FE12b §3.5, §10.4: mientras `NOTIFEVT-004` siga en ADMIN, un `403` en la edición no es un
// error genérico — es la mitad de §10.4 que falta aplicar, y hay que explicarlo, no ocultarlo.
function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

function isDiagtermNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_DIAGTERM_NOT_FOUND');
}

interface EventFormFieldsProps {
  form: UseFormReturn<NotificationEventFormValues>;
  mutationError: EsaviApiError | null;
  // Reenvía el formulario con `esaviCode`/`source` ya borrados — la acción de
  // `NOTIFEVT_00X_DIAGTERM_NOT_FOUND` (§3.5), que no es un error del usuario sino un diccionario
  // sin importar en este despliegue.
  onSaveAsFreeText: (values: NotificationEventFormValues) => void;
}

// Separado de `EventFormDialog` a propósito: sus hooks (`useRef`/`useEffect`/`useState`) tienen
// que montarse y desmontarse con este subárbol, y `<ResourceForm>` no siempre existe — mientras
// `existing.data` no ha resuelto en modo edición, el diálogo pinta un `<p>` de carga en su lugar.
// Si estos hooks vivieran en la función que `ResourceForm` invoca como `children`, aparecerían de
// golpe en un render posterior de `EventFormDialog` y romperían el orden de hooks de React.
function EventFormFields({ form, mutationError, onSaveAsFreeText }: EventFormFieldsProps) {
  const { t } = useTranslation();
  const isOtherEsavi = form.watch('isOtherEsavi');
  const wasOtherEsaviRef = useRef(isOtherEsavi ?? false);
  const [meddraQuery, setMeddraQuery] = useState('');
  const meddraSearch = useMeddraSearch(meddraQuery);

  // Al marcar «otro», el código (y la rama que traía) dejan de tener sentido; al desmarcarlo, la
  // descripción deja de tener sentido — se limpian en el mismo cambio, no al enviar (§3.5, misma
  // técnica que las secciones condicionales de `NotificationStep`).
  useEffect(() => {
    const current = isOtherEsavi ?? false;
    if (current !== wasOtherEsaviRef.current) {
      if (current) {
        form.setValue('esaviCode', null, { shouldDirty: true });
        form.setValue('source', undefined, { shouldDirty: true });
      } else {
        form.setValue('otherDescription', null, { shouldDirty: true });
      }
    }
    wasOtherEsaviRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo dispara con el cambio de la bandera, no en cada render del formulario.
  }, [isOtherEsavi]);

  // §3.5 "El campo del término": elegir una sugerencia fija `source: 'MEDDRA'`; escribirla a mano
  // la deja en `'LOCAL'`, explícito. Editar `esaviName` después no toca ninguna de las dos — la
  // rama sigue el origen del código, nunca el del nombre.
  function handleSelectMeddraTerm(option: TermSearchOption) {
    form.setValue('esaviName', option.name, { shouldDirty: true });
    form.setValue('esaviCode', option.code, { shouldDirty: true });
    form.setValue('source', 'MEDDRA', { shouldDirty: true });
  }

  function handleEsaviCodeChange(raw: string) {
    const trimmed = raw.trim();
    form.setValue('esaviCode', trimmed || null, { shouldDirty: true });
    form.setValue('source', trimmed ? 'LOCAL' : undefined, { shouldDirty: true });
  }

  const showDiagtermNotFound = !!mutationError && isDiagtermNotFound(mutationError);

  return (
    <>
      <FormField
        control={form.control}
        name="esaviName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notification.events.fields.esaviName')}</FormLabel>
            <FormControl>
              <MeddraSearchField
                value={field.value}
                onValueChange={field.onChange}
                onSelect={handleSelectMeddraTerm}
                onQueryChange={setMeddraQuery}
                options={meddraSearch.data?.rows ?? []}
                isLoading={meddraSearch.isLoading}
                isError={meddraSearch.isError}
                serviceUnavailableMessage={t('notification.events.meddraUnavailable')}
                placeholder={t('notification.events.fields.esaviName')}
                ariaLabel={t('notification.events.fields.esaviName')}
              />
            </FormControl>
            {fieldState.error && (
              <p className="text-sm text-destructive">
                {t('notification.events.validation.esaviNameRequired')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="isOtherEsavi"
        render={({ field }) => (
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
              aria-label={t('notification.events.fields.isOtherEsavi')}
            />
            {t('notification.events.fields.isOtherEsavi')}
          </label>
        )}
      />

      {!isOtherEsavi && (
        <FormField
          control={form.control}
          name="esaviCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notification.events.fields.esaviCode')}</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ''}
                  onChange={(event) => handleEsaviCodeChange(event.target.value)}
                />
              </FormControl>
              {showDiagtermNotFound && (
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
                  <p className="text-sm text-muted-foreground">
                    {t('notification.events.diagtermNotImported')}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      onSaveAsFreeText({
                        ...form.getValues(),
                        esaviCode: null,
                        source: undefined,
                      })
                    }
                  >
                    {t('notification.events.keepAsFreeText')}
                  </Button>
                </div>
              )}
            </FormItem>
          )}
        />
      )}

      {isOtherEsavi && (
        <FormField
          control={form.control}
          name="otherDescription"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('notification.events.fields.otherDescription')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {t('notification.events.validation.otherDescriptionRequired')}
                </p>
              )}
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="isMainEsavi"
        render={({ field }) => (
          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-label={t('notification.events.fields.isMainEsavi')}
              />
              {t('notification.events.fields.isMainEsavi')}
            </label>
            {/* Texto explicativo visible, no un `title`: varios eventos principales son válidos
                (SPEC FE12b §3.7). */}
            <p className="text-xs text-muted-foreground">{t('notification.events.help.isMainEsavi')}</p>
          </div>
        )}
      />

      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.events.fields.startDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.events.fields.startDate')}
                allowFuture={false}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="startTime"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.events.fields.startTime')}</FormLabel>
            <FormControl>
              <TimeField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.events.fields.startTime')}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.events.fields.notes')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// El evento del ESAVI — todos los campos de §3.5, con la resolución del término contra MedDRA
// (SPEC FE12b §4 paso 9). `esaviName` nunca se limpia al marcar «otro»: sigue siendo lo que
// escribió el notificador.
export function EventFormDialog({ open, onOpenChange, notificationId, eventId }: EventFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = eventId !== null;
  const existing = notificationEventResource.useOne(eventId ?? '');
  const create = notificationEventResource.useCreate();
  const update = notificationEventResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotificationEventFormValues) {
    // Las dos reglas de «otro» ya garantizan la coherencia (`notificationEventSchema`), así que
    // lo que se envía es literalmente el estado resultante del formulario — CONVENTIONS.md §6.5
    // manda el objeto completo, con el campo oculto viajando en `null` en el mismo `PUT`.
    // `source` viaja tal cual lo dejó el campo del término: sin código no viaja (queda
    // `undefined`, y `JSON.stringify` lo omite del cuerpo) — nunca por omisión accidental.
    const payload: Partial<CreateNotificationEventInput> = {
      esaviName: values.esaviName.trim(),
      esaviCode: values.isOtherEsavi ? null : (values.esaviCode ?? null),
      source: values.isOtherEsavi ? undefined : values.source,
      isMainEsavi: values.isMainEsavi ?? false,
      startDate: values.startDate ?? null,
      startTime: values.startTime ?? null,
      isOtherEsavi: values.isOtherEsavi ?? false,
      otherDescription: values.isOtherEsavi ? (values.otherDescription ?? null) : null,
      notes: values.notes ?? null,
    };

    if (isEditing && eventId) {
      update.mutate(
        { id: eventId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate({ ...payload, notificationId } as CreateNotificationEventInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    // No es un error del usuario: el diccionario de esa fuente no está importado en este
    // despliegue. `EventFormFields` ya lo explica junto al campo de código, con la acción de
    // guardar como texto libre — un toast aquí sería redundante (§3.5).
    if (isDiagtermNotFound(error)) {
      return;
    }
    if (isRoleForbidden(error)) {
      toast.error(t('notification.satellites.adminRequiredEdit'));
      return;
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'notification.events.form.editTitle' : 'notification.events.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotificationEventFormValues>
            key={eventId ?? 'create'}
            schema={notificationEventSchema}
            defaultValues={{
              // `esaviRawName` es lo que escribió el notificador; se muestra en su lugar cuando
              // existe, porque `esaviName` ya trae la reescritura del maestro (§3.3, §3.5).
              esaviName: existing.data?.esaviRawName ?? existing.data?.esaviName ?? '',
              esaviCode: existing.data?.esaviCode ?? null,
              isMainEsavi: existing.data?.isMainEsavi ?? false,
              startDate: existing.data?.startDate ?? null,
              startTime: existing.data?.startTime ?? null,
              isOtherEsavi: existing.data?.isOtherEsavi ?? false,
              otherDescription: existing.data?.otherDescription ?? null,
              notes: existing.data?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notificationEventErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => (
              <EventFormFields form={form} mutationError={mutationError} onSaveAsFreeText={handleSubmit} />
            )}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
