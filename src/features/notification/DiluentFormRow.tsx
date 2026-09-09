import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationDiluentDetail } from '@/contracts/declared/notificationDiluent';
import type { CreateNotificationDiluentInput } from '@/contracts/notificationDiluent';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { DiluentSelect } from '@/shared/components/DiluentSelect';
import { TimeField } from '@/shared/components/TimeField';
import { Button } from '@/shared/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { notificationDiluentResource } from './api';
import {
  createNotificationDiluentSchema,
  notificationDiluentErrorFieldMap,
  type NotificationDiluentFormValues,
} from './schemas';

export interface DiluentFormRowProps {
  vaccineId: string;
  // `vaccinationDate` de la vacuna a la que cuelga — contexto de la coherencia temporal (§3.5),
  // no un campo de este formulario.
  vaccinationDate: string | null;
  // `null` significa «crear».
  diluent: NotificationDiluentDetail | null;
  onDone: () => void;
}

function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

function isCatalogNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_CATALOG_NOT_FOUND');
}

// La fila expandida a formulario (SPEC FE12c §3.1: "no abre un segundo modal"). Sin `<form>`
// propio a propósito — vive dentro del `<form>` de `<VaccineFormDialog>` (`<ResourceForm>`), y
// HTML no admite formularios anidados; el envío es un botón que llama a `form.handleSubmit`, no
// un `type="submit"` nativo.
export function DiluentFormRow({ vaccineId, vaccinationDate, diluent, onDone }: DiluentFormRowProps) {
  const { t } = useTranslation();
  const isEditing = diluent !== null;
  const create = notificationDiluentResource.useCreate();
  const update = notificationDiluentResource.useUpdate();
  const mutation = isEditing ? update : create;

  const form = useForm<NotificationDiluentFormValues>({
    resolver: zodResolver(createNotificationDiluentSchema({ vaccinationDate })),
    defaultValues: {
      diluentCatalogId: diluent?.diluentCatalogId ?? null,
      batchNumber: diluent?.batchNumber ?? null,
      expirationDate: diluent?.expirationDate ?? null,
      reconstitutionDate: diluent?.reconstitutionDate ?? null,
      reconstitutionTime: diluent?.reconstitutionTime ?? null,
      diluentName: diluent?.diluentName ?? null,
      diluentCode: diluent?.diluentCode ?? null,
    },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;

  useEffect(() => {
    if (!mutationError) return;
    const field = notificationDiluentErrorFieldMap[mutationError.code];
    if (field) {
      form.setError(field, { type: 'server', message: mutationError.message });
      return;
    }
    // El 404 heredado dice que la vacuna no está disponible, no que el diluyente no exista
    // (§3.5) — visibilidad heredada de dos niveles.
    if (mutationError.code.endsWith('_VACCINE_NOT_FOUND')) {
      toast.error(t('notificationDiluent.error.parentUnavailable'));
      return;
    }
    if (isCatalogNotFound(mutationError)) {
      return;
    }
    if (isRoleForbidden(mutationError)) {
      toast.error(t('notification.roleForbidden.editDelete'));
      return;
    }
    toast.error(getErrorMessage(mutationError));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando llega un error nuevo, misma razón que ResourceForm.
  }, [mutationError]);

  function handleSubmit(values: NotificationDiluentFormValues) {
    const payload: Partial<CreateNotificationDiluentInput> = {
      diluentCatalogId: values.diluentCatalogId ?? null,
      batchNumber: values.batchNumber ?? null,
      expirationDate: values.expirationDate ?? null,
      reconstitutionDate: values.reconstitutionDate ?? null,
      reconstitutionTime: values.reconstitutionTime ?? null,
      diluentName: values.diluentName ?? null,
      diluentCode: values.diluentCode ?? null,
    };

    if (isEditing && diluent) {
      update.mutate(
        { id: diluent.diluentId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            onDone();
          },
        },
      );
      return;
    }

    create.mutate({ ...payload, vaccineId } as CreateNotificationDiluentInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        onDone();
      },
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Form {...form}>
        <FormField
          control={form.control}
          name="diluentCatalogId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.diluentCatalogId')}</FormLabel>
              <FormControl>
                <DiluentSelect
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('notificationDiluent.field.diluentCatalogId')}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="diluentName"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.diluentName')}</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
              {fieldState.error && (
                <p className="text-sm text-destructive">{t('notificationDiluent.error.diluentRequired')}</p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="diluentCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.diluentCode')}</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="batchNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.batchNumber')}</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expirationDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.expirationDate')}</FormLabel>
              <FormControl>
                <DateField
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('notificationDiluent.field.expirationDate')}
                  allowFuture
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reconstitutionDate"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.reconstitutionDate')}</FormLabel>
              <FormControl>
                <DateField
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('notificationDiluent.field.reconstitutionDate')}
                  allowFuture={false}
                />
              </FormControl>
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {t('notificationDiluent.error.reconstitutionAfterVaccination')}
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reconstitutionTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notificationDiluent.field.reconstitutionTime')}</FormLabel>
              <FormControl>
                <TimeField
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('notificationDiluent.field.reconstitutionTime')}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            {t('common.satelliteList.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void form.handleSubmit(handleSubmit)()}
            disabled={mutation.isPending}
          >
            {t('common.satelliteList.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
