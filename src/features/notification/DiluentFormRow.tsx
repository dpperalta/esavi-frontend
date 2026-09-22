import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NotificationDiluentDetail } from '@/contracts/declared/notificationDiluent';
import type { CreateNotificationDiluentInput } from '@/contracts/notificationDiluent';
import { diluentResource } from '@/features/diluent/api';
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

// `code` normalizado con `toConstantCase` en el `diluentCatalog` seeded a mano (SPEC F23 §3.5
// backend) — no hay un valor fijo en el contrato, es una decisión de este despliegue.
const OTHER_DILUENT_CODE = 'OTHER';

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
    // `as Resolver<…>`, same precedent as ClassificationStep: the `z.preprocess` fields type their
    // *input* as `unknown`, so the inferred resolver never matches the contract-derived values.
    resolver: zodResolver(
      createNotificationDiluentSchema({ vaccinationDate }),
    ) as Resolver<NotificationDiluentFormValues>,
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

  // El desplegable ya carga esta misma lista (`<DiluentSelect>`), así que esto reutiliza la
  // caché de TanStack Query en vez de pedirla dos veces — sólo hace falta el `code` de la fila
  // elegida, que `<DiluentSelect>` no expone.
  const diluentCatalogId = form.watch('diluentCatalogId');
  const diluentCatalog = diluentResource.useList({ pageSize: 100 });
  const diluentCatalogRows = diluentCatalog.data?.rows ?? [];
  const selectedDiluentCode =
    diluentCatalogRows.find((row) => row.diluentCatalogId === diluentCatalogId)?.code ?? null;
  // El maestro sin semillas (§10.5: la situación de todo despliegue de hoy salvo que alguien lo
  // llene a mano) es el único caso donde «sin fila elegida» significa registro crudo — ahí
  // `diluentName`/`diluentCode` son la única forma de satisfacer la guarda de contenido mínimo.
  // Con el maestro sembrado, no elegir nada todavía no es eso: se queda oculto hasta que el
  // usuario elija explícitamente «Otro diluyente», la fila que no está codificada por la FK.
  const isCatalogUnseeded = diluentCatalog.isSuccess && diluentCatalogRows.length === 0;
  const showsFreeTextFields =
    selectedDiluentCode === OTHER_DILUENT_CODE || (isCatalogUnseeded && diluentCatalogId === null);

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
                  onChange={(next) => {
                    field.onChange(next);
                    const nextCode =
                      diluentCatalog.data?.rows.find((row) => row.diluentCatalogId === next)?.code ?? null;
                    if (next !== null && nextCode !== OTHER_DILUENT_CODE) {
                      form.setValue('diluentName', null, { shouldDirty: true, shouldValidate: true });
                      form.setValue('diluentCode', null, { shouldDirty: true });
                    }
                  }}
                  ariaLabel={t('notificationDiluent.field.diluentCatalogId')}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div aria-live="polite" className="flex flex-col gap-3">
          {showsFreeTextFields && (
            <>
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
            </>
          )}
        </div>

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
