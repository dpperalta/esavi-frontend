import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { TimeField } from '@/shared/components/TimeField';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { notificationEventResource } from './api';
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

// Separado de `EventFormDialog` a propósito: sus hooks (`useRef`/`useEffect`) tienen que montarse
// y desmontarse con este subárbol, y `<ResourceForm>` no siempre existe — mientras `existing.data`
// no ha resuelto en modo edición, el diálogo pinta un `<p>` de carga en su lugar. Si estos hooks
// vivieran en la función que `ResourceForm` invoca como `children`, aparecerían de golpe en un
// render posterior de `EventFormDialog` y romperían el orden de hooks de React.
function EventFormFields({ form }: { form: UseFormReturn<NotificationEventFormValues> }) {
  const { t } = useTranslation();
  const isOtherEsavi = form.watch('isOtherEsavi');
  const wasOtherEsaviRef = useRef(isOtherEsavi ?? false);

  // Al marcar «otro», el código deja de tener sentido; al desmarcarlo, la descripción deja de
  // tener sentido — se limpian en el mismo cambio, no al enviar (§3.5, misma técnica que las
  // secciones condicionales de `NotificationStep`).
  useEffect(() => {
    const current = isOtherEsavi ?? false;
    if (current !== wasOtherEsaviRef.current) {
      if (current) {
        form.setValue('esaviCode', null, { shouldDirty: true });
      } else {
        form.setValue('otherDescription', null, { shouldDirty: true });
      }
    }
    wasOtherEsaviRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo dispara con el cambio de la bandera, no en cada render del formulario.
  }, [isOtherEsavi]);

  return (
    <>
      <FormField
        control={form.control}
        name="esaviName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notification.events.fields.esaviName')}</FormLabel>
            <FormControl>
              <Input {...field} />
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
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
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

// El evento del ESAVI — todos los campos de §3.5 menos la resolución del término (paso 9 de
// este spec le da a `esaviName`/`esaviCode` su `<MeddraSearchField>`). `esaviName` nunca se
// limpia al marcar «otro»: sigue siendo lo que escribió el notificador (§3.5).
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
    const payload: Partial<CreateNotificationEventInput> = {
      esaviName: values.esaviName.trim(),
      esaviCode: values.isOtherEsavi ? null : (values.esaviCode ?? null),
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
              esaviName: existing.data?.esaviName ?? '',
              esaviCode: existing.data?.esaviRawName ? null : (existing.data?.esaviCode ?? null),
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
            {(form) => <EventFormFields form={form} />}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
