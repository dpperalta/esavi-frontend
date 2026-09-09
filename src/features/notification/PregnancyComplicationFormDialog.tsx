import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationPregnancyComplicationInput } from '@/contracts/notificationPregnancyComplication';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { MeddraSearchField } from '@/shared/components/MeddraSearchField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';
import { notificationPregnancyComplicationResource, useMeddraSearch } from './api';
import {
  notificationPregnancyComplicationErrorFieldMap,
  notificationPregnancyComplicationSchema,
  type NotificationPregnancyComplicationFormValues,
} from './schemas';

export interface PregnancyComplicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pregnancyId: string;
  // `null` significa «crear» — mismo precedente que `EventFormDialog`.
  complicationId: string | null;
}

// SPEC FE12d §10.4: sólo el `005A` exige ADMIN — crear y corregir una complicación son `USER`,
// así que un `403` aquí es tan raro como en `EventFormDialog` y se explica igual.
function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

function isDiagtermNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_DIAGTERM_NOT_FOUND');
}

interface PregnancyComplicationFormFieldsProps {
  form: UseFormReturn<NotificationPregnancyComplicationFormValues>;
  mutationError: EsaviApiError | null;
  // Reenvía el formulario con `complicationCode`/`source` ya borrados — la acción de
  // `PREGCOMP_00X_DIAGTERM_NOT_FOUND` (§3.5), igual que `EventFormFields`.
  onSaveAsFreeText: (values: NotificationPregnancyComplicationFormValues) => void;
}

// Separado de `PregnancyComplicationFormDialog` por el mismo motivo que `EventFormFields`: sus
// hooks tienen que montarse y desmontarse con este subárbol, no aparecer de golpe en un render
// posterior mientras `existing.data` todavía no resolvió en modo edición.
function PregnancyComplicationFormFields({
  form,
  mutationError,
  onSaveAsFreeText,
}: PregnancyComplicationFormFieldsProps) {
  const { t } = useTranslation();
  const [meddraQuery, setMeddraQuery] = useState('');
  const meddraSearch = useMeddraSearch(meddraQuery);
  // `<CatalogSelect>` ya pinta su propio deshabilitado-con-explicación cuando el catálogo está
  // vacío (§3.6, "reutiliza las de `CatalogSelect`") — esta segunda lectura, con la misma caché de
  // 30 minutos, sólo decide si además se explica por qué el guardado va a fallar: el tipo es
  // obligatorio y sin ítems no hay nada que elegir (§3.6, la nota sobre el único catálogo
  // bloqueante del paso 4).
  const complicationTypeCatalog = useCatalogItemsByTypeCode('pregnancyComplicationType');
  const complicationTypeCatalogEmpty =
    !complicationTypeCatalog.isLoading &&
    !complicationTypeCatalog.isError &&
    (!complicationTypeCatalog.catalogTypeId || complicationTypeCatalog.rows.length === 0);

  // Mismo criterio que `EventFormFields.handleSelectMeddraTerm` (SPEC FE12d §3.5, tabla de
  // `source`): una sugerencia del buscador deja `source: 'MEDDRA'`; escribir el código a mano lo
  // deja en `'LOCAL'`, explícito.
  function handleSelectMeddraTerm(option: TermSearchOption) {
    form.setValue('complicationName', option.name, { shouldDirty: true });
    form.setValue('complicationCode', option.code, { shouldDirty: true });
    form.setValue('source', 'MEDDRA', { shouldDirty: true });
  }

  function handleComplicationCodeChange(raw: string) {
    const trimmed = raw.trim();
    form.setValue('complicationCode', trimmed || null, { shouldDirty: true });
    form.setValue('source', trimmed ? 'LOCAL' : undefined, { shouldDirty: true });
  }

  const showDiagtermNotFound = !!mutationError && isDiagtermNotFound(mutationError);

  return (
    <>
      <FormField
        control={form.control}
        name="complicationName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notification.pregnancy.complications.field.complicationName')}</FormLabel>
            <FormControl>
              <MeddraSearchField
                value={field.value}
                onValueChange={field.onChange}
                onSelect={handleSelectMeddraTerm}
                onQueryChange={setMeddraQuery}
                options={meddraSearch.data?.rows ?? []}
                isLoading={meddraSearch.isLoading}
                isError={meddraSearch.isError}
                serviceUnavailableMessage={t('notification.pregnancy.complications.meddraUnavailable')}
                placeholder={t('notification.pregnancy.complications.field.complicationName')}
                ariaLabel={t('notification.pregnancy.complications.field.complicationName')}
              />
            </FormControl>
            {fieldState.error && (
              <p className="text-sm text-destructive">
                {t('notification.pregnancy.complications.validation.complicationNameRequired')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="complicationCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.pregnancy.complications.field.complicationCode')}</FormLabel>
            <FormControl>
              <Input
                value={field.value ?? ''}
                onChange={(event) => handleComplicationCodeChange(event.target.value)}
              />
            </FormControl>
            {showDiagtermNotFound && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
                <p className="text-sm text-muted-foreground">
                  {t('notification.pregnancy.complications.diagtermNotImported')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    onSaveAsFreeText({
                      ...form.getValues(),
                      complicationCode: null,
                      source: undefined,
                    })
                  }
                >
                  {t('notification.pregnancy.complications.keepAsFreeText')}
                </Button>
              </div>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="complicationTypeItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.pregnancy.complications.field.complicationTypeItemId')}</FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="pregnancyComplicationType"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.pregnancy.complications.field.complicationTypeItemId')}
              />
            </FormControl>
            {complicationTypeCatalogEmpty && (
              <p className="text-sm text-destructive">
                {t('notification.pregnancy.complications.error.typeCatalogEmpty')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.pregnancy.complications.field.notes')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// La complicación (SPEC FE12d §4 paso 9), sobre `<MeddraSearchField>` — mismo mecanismo de
// resolución que `EventFormDialog`, distinto término. `complicationTypeItemId` es el único de los
// dos obligatorios que no pasa por el buscador: `pregnancyComplicationType` es el único catálogo
// bloqueante del paso 4 (§3.6) porque el DDL lo admite nulo pero el validador lo exige.
export function PregnancyComplicationFormDialog({
  open,
  onOpenChange,
  pregnancyId,
  complicationId,
}: PregnancyComplicationFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = complicationId !== null;
  const existing = notificationPregnancyComplicationResource.useOne(complicationId ?? '');
  const create = notificationPregnancyComplicationResource.useCreate();
  const update = notificationPregnancyComplicationResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotificationPregnancyComplicationFormValues) {
    // El objeto completo viaja siempre (SPEC FE12d §3.5, "se envía el objeto completo en el
    // `PUT`"): sin variante de edición para los dos obligatorios, a diferencia del bloque de
    // embarazo — corregir es mandar el valor correcto, nunca borrarlo (§3.3).
    const payload: Partial<CreateNotificationPregnancyComplicationInput> = {
      complicationName: values.complicationName.trim(),
      complicationCode: values.complicationCode ?? null,
      complicationTypeItemId: values.complicationTypeItemId,
      source: values.source,
      notes: values.notes ?? null,
    };

    if (isEditing && complicationId) {
      update.mutate(
        { id: complicationId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(
      { ...payload, pregnancyId } as CreateNotificationPregnancyComplicationInput,
      {
        onSuccess: () => {
          toast.success(t('common.toast.created'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    // No es un error del usuario: el diccionario de esa fuente no está importado en este
    // despliegue. `PregnancyComplicationFormFields` ya lo explica junto al campo de código, con la
    // acción de guardar como texto libre — un toast aquí sería redundante (§3.5).
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
            {t(
              isEditing
                ? 'notification.pregnancy.complications.form.editTitle'
                : 'notification.pregnancy.complications.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotificationPregnancyComplicationFormValues>
            key={complicationId ?? 'create'}
            schema={notificationPregnancyComplicationSchema}
            defaultValues={{
              // `complicationRawName` es lo que escribió el notificador; se muestra en su lugar
              // cuando existe, y si no, el nombre del `diagnosticTerm` incluido en la respuesta
              // (§3.5) — no hay `esaviName` en esta tabla, a diferencia de `notificationEvent`.
              complicationName:
                existing.data?.complicationRawName ?? existing.data?.diagnosticTerm?.name ?? '',
              complicationCode: existing.data?.diagnosticTerm?.code ?? null,
              complicationTypeItemId: existing.data?.complicationTypeItemId ?? '',
              notes: existing.data?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notificationPregnancyComplicationErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => (
              <PregnancyComplicationFormFields
                form={form}
                mutationError={mutationError}
                onSaveAsFreeText={handleSubmit}
              />
            )}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
