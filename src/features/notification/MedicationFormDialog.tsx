import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationMedicationInput } from '@/contracts/notificationMedication';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { WhodrugProductSearchField } from '@/shared/components/WhodrugProductSearchField';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { WHODRUG_PRODUCT_SEARCH_LIMIT, notificationMedicationResource, useWhodrugProductSearch } from './api';
import {
  notificationMedicationErrorFieldMap,
  notificationMedicationSchema,
  type NotificationMedicationFormValues,
} from './schemas';

export interface MedicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationId: string;
  // `null` significa «crear» — mismo precedente que `EventFormDialog`.
  medicationId: string | null;
}

// SPEC FE12b §3.5, §10.4: mientras `NOTIFMED-004` siga en ADMIN, un `403` en la edición no es un
// error genérico.
function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

// Separado de `MedicationFormDialog` por la misma razón que `EventFormFields`: sus hooks tienen
// que montarse y desmontarse con este subárbol, nunca en la función que `<ResourceForm>` invoca
// como `children`.
function MedicationFormFields({ form }: { form: UseFormReturn<NotificationMedicationFormValues> }) {
  const { t } = useTranslation();
  const isOtherMedication = form.watch('isOtherMedication');
  const medicationCode = form.watch('medicationCode');
  const wasOtherMedicationRef = useRef(isOtherMedication ?? false);
  const [whodrugQuery, setWhodrugQuery] = useState('');
  const whodrugSearch = useWhodrugProductSearch(whodrugQuery);

  // Marcar «otra medicación» limpia `medicationCode` a `null` aunque el backend no lo exija
  // (§3.5, §6): declarar «otra» significa que no está en el catálogo, y conservar el código del
  // maestro debajo sería la contradicción que el SPEC F56 existe para evitar.
  useEffect(() => {
    const current = isOtherMedication ?? false;
    if (current !== wasOtherMedicationRef.current && current) {
      form.setValue('medicationCode', null, { shouldDirty: true });
    }
    wasOtherMedicationRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo dispara con el cambio de la bandera.
  }, [isOtherMedication]);

  // §3.5 "Los tres caminos del nombre de la medicación": elegir del buscador deja el nombre en
  // sólo lectura y manda el `code` del maestro.
  function handleSelectWhodrugProduct(option: TermSearchOption) {
    form.setValue('medicationName', option.name, { shouldDirty: true });
    form.setValue('medicationCode', option.code, { shouldDirty: true });
  }

  // La acción «quitar»: devuelve el nombre a texto libre sin vaciarlo — el usuario sigue viendo
  // lo que había elegido y puede corregirlo — y manda `medicationCode: null`.
  function handleClearWhodrugProduct() {
    form.setValue('medicationCode', null, { shouldDirty: true });
  }

  const fromCatalog = !isOtherMedication && !!medicationCode;

  return (
    <>
      <FormField
        control={form.control}
        name="medicationName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notification.medications.fields.medicationName')}</FormLabel>
            <FormControl>
              {isOtherMedication ? (
                <Input {...field} value={field.value ?? ''} />
              ) : (
                <WhodrugProductSearchField
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onSelect={handleSelectWhodrugProduct}
                  onQueryChange={setWhodrugQuery}
                  options={whodrugSearch.data?.rows ?? []}
                  isLoading={whodrugSearch.isLoading}
                  isError={whodrugSearch.isError}
                  moreResultsAvailable={whodrugSearch.data?.count === WHODRUG_PRODUCT_SEARCH_LIMIT}
                  serviceUnavailableMessage={t('notification.medications.catalogUnavailable')}
                  noResultsMessage={t('notification.medications.notInCatalog')}
                  placeholder={t('notification.medications.fields.medicationName')}
                  ariaLabel={t('notification.medications.fields.medicationName')}
                  readOnly={fromCatalog}
                  onClear={fromCatalog ? handleClearWhodrugProduct : undefined}
                />
              )}
            </FormControl>
            {/* La marca del nombre bloqueado (§3.8) — sólo tiene sentido junto al buscador. */}
            {fromCatalog && (
              <p className="text-xs text-muted-foreground">{t('notification.medications.fromCatalog')}</p>
            )}
            {fieldState.error && (
              <p className="text-sm text-destructive">
                {t('notification.medications.validation.medicationNameRequired')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="dose"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medications.fields.dose')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pharmaceuticalFormItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medications.fields.pharmaceuticalFormItemId')}</FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="pharmaceuticalForm"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.medications.fields.pharmaceuticalFormItemId')}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="administrationRouteItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medications.fields.administrationRouteItemId')}</FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="administrationRoute"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.medications.fields.administrationRouteItemId')}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medications.fields.startDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.medications.fields.startDate')}
                allowFuture={false}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="isOtherMedication"
        render={({ field }) => (
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
              aria-label={t('notification.medications.fields.isOtherMedication')}
            />
            {t('notification.medications.fields.isOtherMedication')}
          </label>
        )}
      />

      {isOtherMedication && (
        <FormField
          control={form.control}
          name="otherMedicationText"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('notification.medications.fields.otherMedicationText')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {t('notification.medications.validation.otherTextRequired')}
                </p>
              )}
            </FormItem>
          )}
        />
      )}
    </>
  );
}

// La medicación concomitante — todos los campos de §3.5, con el buscador de WHODrug y sus tres
// caminos de entrada (SPEC FE12b §4 paso 10). `medicationCode` no tiene ningún control propio en
// el DOM: lo rellena el buscador, o queda vacío.
export function MedicationFormDialog({
  open,
  onOpenChange,
  notificationId,
  medicationId,
}: MedicationFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = medicationId !== null;
  const existing = notificationMedicationResource.useOne(medicationId ?? '');
  const create = notificationMedicationResource.useCreate();
  const update = notificationMedicationResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotificationMedicationFormValues) {
    // CONVENTIONS.md §6.5: el objeto completo viaja, con el campo oculto en `null` en el mismo
    // `PUT`. `medicationCode` se limpia aquí también si «otra medicación» quedó marcada — regla
    // del cliente, no del backend (§3.5).
    const payload: Partial<CreateNotificationMedicationInput> = {
      medicationName: values.medicationName.trim(),
      medicationCode: values.isOtherMedication ? null : (values.medicationCode ?? null),
      dose: values.dose ?? null,
      pharmaceuticalFormItemId: values.pharmaceuticalFormItemId ?? null,
      administrationRouteItemId: values.administrationRouteItemId ?? null,
      startDate: values.startDate ?? null,
      isOtherMedication: values.isOtherMedication ?? false,
      otherMedicationText: values.isOtherMedication ? (values.otherMedicationText ?? null) : null,
    };

    if (isEditing && medicationId) {
      update.mutate(
        { id: medicationId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate({ ...payload, notificationId } as CreateNotificationMedicationInput, {
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
            {t(
              isEditing
                ? 'notification.medications.form.editTitle'
                : 'notification.medications.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotificationMedicationFormValues>
            key={medicationId ?? 'create'}
            schema={notificationMedicationSchema}
            defaultValues={{
              medicationName: existing.data?.medicationName ?? '',
              medicationCode: existing.data?.medicationCode ?? null,
              dose: existing.data?.dose ?? null,
              pharmaceuticalFormItemId: existing.data?.pharmaceuticalForm?.catalogItemId ?? null,
              administrationRouteItemId: existing.data?.administrationRoute?.catalogItemId ?? null,
              startDate: existing.data?.startDate ?? null,
              isOtherMedication: existing.data?.isOtherMedication ?? false,
              otherMedicationText: existing.data?.otherMedicationText ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notificationMedicationErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => <MedicationFormFields form={form} />}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
