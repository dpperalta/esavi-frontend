import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationVaccineInput } from '@/contracts/notificationVaccine';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { NumberField } from '@/shared/components/NumberField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { TimeField } from '@/shared/components/TimeField';
import { WhodrugTreePicker, type WhodrugResolution } from '@/shared/components/WhodrugTreePicker';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { notificationVaccineResource, useNotificationVaccinesByCase } from './api';
import { DiluentList } from './DiluentList';
import {
  createNotificationVaccineSchema,
  notificationVaccineErrorFieldMap,
  type NotificationVaccineFormValues,
} from './schemas';

export interface VaccineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  notificationId: string;
  // El `eventDate` del caso (FE09/FE10) — la coherencia temporal de §3.5 lo necesita como
  // contexto del schema, no como campo de este formulario.
  eventDate: string | null;
  // `null` significa «crear» — mismo precedente que `EventFormDialog`/`MedicationFormDialog`.
  vaccineId: string | null;
}

function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

function isWhodrugNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_WHODRUG_NOT_FOUND');
}

interface VaccineFormFieldsProps {
  form: UseFormReturn<NotificationVaccineFormValues>;
  mutationError: EsaviApiError | null;
  // El id real de la vacuna ya creada — `null` mientras sigue en fase 1 (SPEC FE12c §3.1, §4
  // paso 9). Nunca el de `defaultValues`: ese no cambia cuando el `POST` de fase 1 responde.
  savedVaccineId: string | null;
}

// Separado de `VaccineFormDialog`, misma razón que `EventFormFields`: sus campos no existen
// mientras `existing` no ha resuelto en modo edición, y no pueden montarse a medio camino de los
// hooks del diálogo.
function VaccineFormFields({ form, mutationError, savedVaccineId }: VaccineFormFieldsProps) {
  const { t } = useTranslation();
  const vaccineWhodrugId = form.watch('vaccineWhodrugId') ?? null;
  const vaccinationDate = form.watch('vaccinationDate') ?? null;

  // Rellenado al resolverse el árbol, contra la fila del `ESAVI-WHODRUG-003` (§3.5): los tres
  // textos son copia, nunca se vuelven a derivar después.
  function handleResolve(resolution: WhodrugResolution) {
    form.setValue('vaccineWhodrugId', resolution.vaccineWhodrugId, { shouldDirty: true });
    form.setValue('whoCode', resolution.whoCode, { shouldDirty: true });
    form.setValue('vaccineCode', resolution.vaccineCode, { shouldDirty: true });
    form.setValue('vaccineName', resolution.vaccineName, { shouldDirty: true });
  }

  function handleClear() {
    form.setValue('vaccineWhodrugId', null, { shouldDirty: true });
    form.setValue('whoCode', null, { shouldDirty: true });
    form.setValue('vaccineCode', null, { shouldDirty: true });
    form.setValue('vaccineName', null, { shouldDirty: true });
  }

  // La rama cruda del nivel 1: guarda `vaccineName` con la abreviatura y deja el resto vacío —
  // no es un caso degradado, es el frecuente (§1, §3.5).
  function handleAssignAbbreviation(abbreviation: string) {
    form.setValue('vaccineWhodrugId', null, { shouldDirty: true });
    form.setValue('whoCode', null, { shouldDirty: true });
    form.setValue('vaccineCode', null, { shouldDirty: true });
    form.setValue('vaccineName', abbreviation, { shouldDirty: true });
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t('notificationVaccine.field.vaccineName')}</p>
        <WhodrugTreePicker
          vaccineWhodrugId={vaccineWhodrugId}
          onResolve={handleResolve}
          onClear={handleClear}
          onAssignAbbreviation={handleAssignAbbreviation}
        />
        {mutationError && isWhodrugNotFound(mutationError) && (
          <p className="text-sm text-destructive">{t('notificationVaccine.error.whodrugNotFound')}</p>
        )}
      </div>

      {/* Texto de solo lectura (§3.5): sólo cambia al elegir en el árbol, nunca por captura. */}
      <FormField
        control={form.control}
        name="whoCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.whoCode')}</FormLabel>
            <FormControl>
              <Input value={field.value ?? ''} readOnly disabled />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="vaccineCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.vaccineCode')}</FormLabel>
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
        name="vaccineName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.vaccineName')}</FormLabel>
            <FormControl>
              <Input
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
              />
            </FormControl>
            {fieldState.error && (
              <p className="text-sm text-destructive">{t('notificationVaccine.error.vaccineRequired')}</p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="isSuspected"
        render={({ field }) => (
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              aria-label={t('notificationVaccine.field.isSuspected')}
            />
            {t('notificationVaccine.field.isSuspected')}
          </label>
        )}
      />

      <FormField
        control={form.control}
        name="vaccinationDate"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.vaccinationDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notificationVaccine.field.vaccinationDate')}
                allowFuture={false}
              />
            </FormControl>
            {fieldState.error && (
              <p className="text-sm text-destructive">
                {t('notificationVaccine.error.vaccinationAfterEvent')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="vaccinationTime"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.vaccinationTime')}</FormLabel>
            <FormControl>
              <TimeField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notificationVaccine.field.vaccinationTime')}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="doseNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notificationVaccine.field.doseNumber')}</FormLabel>
            <FormControl>
              <NumberField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notificationVaccine.field.doseNumber')}
                min={0}
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
            <FormLabel>{t('notificationVaccine.field.batchNumber')}</FormLabel>
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
            <FormLabel>{t('notificationVaccine.field.expirationDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notificationVaccine.field.expirationDate')}
                allowFuture
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
            <FormLabel>{t('notificationVaccine.field.notes')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />

      <DiluentList vaccineId={savedVaccineId} vaccinationDate={vaccinationDate} />
    </>
  );
}

// La vacuna — fase 1 (SPEC FE12c §4 paso 8): los diez campos y el árbol WHODrug, sin la sección
// de diluyentes todavía (paso 9). El modal se abre sobre `['notificationVaccine','byCase',caseId]`
// — la misma clave que `<VaccineList>` consulta — nunca sobre `ESAVI-NOTIFVAC-003` ni sobre una
// copia guardada al listar (§3.2, "Qué no se consume").
export function VaccineFormDialog({
  open,
  onOpenChange,
  caseId,
  notificationId,
  eventDate,
  vaccineId,
}: VaccineFormDialogProps) {
  const { t } = useTranslation();
  // El id real una vez responde el `POST` de fase 1 — mientras `vaccineId` (el de alta) siga
  // `null`, esto es lo único que dice que la fila ya existe y la sección de diluyentes puede
  // habilitarse, sin esperar a que el llamador reabra el diálogo con un `vaccineId` distinto
  // (SPEC FE12c §3.1, §4 paso 9).
  const [createdVaccineId, setCreatedVaccineId] = useState<string | null>(null);
  const savedVaccineId = vaccineId ?? createdVaccineId;
  const isEditing = savedVaccineId !== null;
  const vaccinesByCase = useNotificationVaccinesByCase(caseId, open);
  const existing = vaccinesByCase.data?.rows.find((row) => row.vaccineId === savedVaccineId) ?? null;
  const create = notificationVaccineResource.useCreate();
  const update = notificationVaccineResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
      setCreatedVaccineId(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotificationVaccineFormValues) {
    // Se envía el objeto completo (CONVENTIONS.md §6.5): el backend escribe sólo lo que cambió.
    const payload: Partial<CreateNotificationVaccineInput> = {
      vaccineWhodrugId: values.vaccineWhodrugId ?? null,
      isSuspected: values.isSuspected ?? false,
      whoCode: values.whoCode ?? null,
      vaccineCode: values.vaccineCode ?? null,
      vaccineName: values.vaccineName ?? null,
      vaccinationDate: values.vaccinationDate ?? null,
      vaccinationTime: values.vaccinationTime ?? null,
      doseNumber: values.doseNumber ?? null,
      batchNumber: values.batchNumber ?? null,
      expirationDate: values.expirationDate ?? null,
      notes: values.notes ?? null,
    };

    if (isEditing && savedVaccineId) {
      update.mutate(
        { id: savedVaccineId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }

    create.mutate({ ...payload, notificationId } as CreateNotificationVaccineInput, {
      onSuccess: (data) => {
        toast.success(t('common.toast.created'));
        // Fase 1 → fase 2 (SPEC FE12c §3.1, §4 paso 9): el modal permanece abierto sobre la fila
        // recién creada y la sección de diluyentes se habilita — no se cierra.
        setCreatedVaccineId(data.vaccineId);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    // No es un error del usuario: la entrada fue retirada del diccionario entre elegirla y
    // guardar. `VaccineFormFields` ya lo explica junto al árbol — un toast aquí sería redundante.
    if (isWhodrugNotFound(error)) {
      return;
    }
    if (isRoleForbidden(error)) {
      toast.error(t('notification.roleForbidden.editDelete'));
      return;
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  // Basado en el `vaccineId` original de alta/edición, no en `savedVaccineId`: una vez que la
  // fase 1 crea la fila, ya hay datos completos en el formulario y no hace falta esperar a que
  // la invalidación de la caché la traiga de vuelta para seguir mostrándolo.
  const readyToRender = vaccineId === null || !!vaccinesByCase.data?.rows.find((row) => row.vaccineId === vaccineId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'notificationVaccine.form.title.edit' : 'notificationVaccine.form.title.create')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotificationVaccineFormValues>
            key={vaccineId ?? 'create'}
            schema={createNotificationVaccineSchema({ eventDate })}
            defaultValues={{
              vaccineWhodrugId: existing?.vaccineWhodrugId ?? null,
              isSuspected: existing?.isSuspected ?? false,
              whoCode: existing?.whoCode ?? null,
              vaccineCode: existing?.vaccineCode ?? null,
              vaccineName: existing?.vaccineName ?? null,
              vaccinationDate: existing?.vaccinationDate ?? null,
              vaccinationTime: existing?.vaccinationTime ?? null,
              doseNumber: existing?.doseNumber ?? null,
              batchNumber: existing?.batchNumber ?? null,
              expirationDate: existing?.expirationDate ?? null,
              notes: existing?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notificationVaccineErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => (
              <VaccineFormFields form={form} mutationError={mutationError} savedVaccineId={savedVaccineId} />
            )}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
