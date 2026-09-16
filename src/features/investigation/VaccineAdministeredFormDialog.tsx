import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateInvestigationVaccineAdministeredInput } from '@/contracts/investigationVaccineAdministered';
import type { InvestigationVaccineAdministeredDetail } from '@/contracts/declared/investigationVaccineAdministered';
import { investigationVaccineAdministeredResource } from '@/features/investigation/api';
import {
  vaccineAdministeredErrorFieldMap,
  vaccineAdministeredSaveSchema,
  type VaccineAdministeredFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { NumberField } from '@/shared/components/NumberField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { WhodrugTreePicker } from '@/shared/components/WhodrugTreePicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Textarea } from '@/shared/components/ui/textarea';

export interface VaccineAdministeredFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investigationId: string;
  // The full row when editing, `null` when adding — the list already brought it down through
  // `-002A`, so a second read by id isn't part of this spec's route table (§3.2).
  vaccineAdministered: InvestigationVaccineAdministeredDetail | null;
}

interface VaccineAdministeredFormFieldsProps {
  form: UseFormReturn<VaccineAdministeredFormValues>;
}

function VaccineAdministeredFormFields({ form }: VaccineAdministeredFormFieldsProps) {
  const { t } = useTranslation();
  const vaccineWhodrugId = form.watch('vaccineWhodrugId');

  function handleResolve(resolution: { vaccineWhodrugId: string }) {
    form.setValue('vaccineWhodrugId', resolution.vaccineWhodrugId, { shouldDirty: true, shouldValidate: true });
  }

  function handleClear() {
    form.setValue('vaccineWhodrugId', null, { shouldDirty: true, shouldValidate: true });
  }

  // No hay rama cruda para esta tabla (§3.5): `vaccineWhodrugId` es obligatorio y no existe un
  // campo de texto libre donde guardar la abreviatura suelta. El botón de `<WhodrugTreePicker>`
  // sigue visible — es parte del primitivo compartido y este spec no lo toca (§3.1) — pero avisa
  // en vez de aparentar que hizo algo.
  function handleAssignAbbreviation() {
    toast.error(t('investigation.vaccinesAdministered.error.noRawVaccine'));
  }

  return (
    <>
      <FormField
        control={form.control}
        name="vaccineWhodrugId"
        render={() => (
          <FormItem>
            <FormLabel>{t('investigation.vaccinesAdministered.field.vaccine')}</FormLabel>
            <FormControl>
              <WhodrugTreePicker
                vaccineWhodrugId={vaccineWhodrugId}
                onResolve={handleResolve}
                onClear={handleClear}
                onAssignAbbreviation={handleAssignAbbreviation}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="doseNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.vaccinesAdministered.field.doseNumber')}</FormLabel>
            <FormControl>
              <NumberField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.vaccinesAdministered.field.doseNumber')}
                min={0}
                max={32767}
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
            <FormLabel>{t('investigation.vaccinesAdministered.field.notes')}</FormLabel>
            <FormControl>
              <Textarea
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// Create/edit dialog for D.1–D.2 (SPEC FE13d §3.5, §4 paso 6). No delete action here either (§2,
// deuda de `CASE-PROCESS.md` §10 — ver `VaccineAdministeredList`).
export function VaccineAdministeredFormDialog({
  open,
  onOpenChange,
  investigationId,
  vaccineAdministered,
}: VaccineAdministeredFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = vaccineAdministered !== null;
  const create = investigationVaccineAdministeredResource.useCreate();
  const update = investigationVaccineAdministeredResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: VaccineAdministeredFormValues) {
    // El schema ya garantiza que `vaccineWhodrugId` no es null antes de llegar aquí (§3.5,
    // bloqueante) — el cast refleja esa garantía, mismo patrón que `DiagnosticFormDialog`.
    const payload = {
      vaccineWhodrugId: values.vaccineWhodrugId,
      doseNumber: values.doseNumber ?? null,
      notes: values.notes ?? null,
    } as Omit<CreateInvestigationVaccineAdministeredInput, 'investigationId'>;

    if (isEditing && vaccineAdministered) {
      update.mutate(
        { id: vaccineAdministered.vaccineAdministeredId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate({ ...payload, investigationId } as CreateInvestigationVaccineAdministeredInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              isEditing
                ? 'investigation.vaccinesAdministered.form.editTitle'
                : 'investigation.vaccinesAdministered.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        <ResourceForm<VaccineAdministeredFormValues>
          key={vaccineAdministered?.vaccineAdministeredId ?? 'create'}
          schema={vaccineAdministeredSaveSchema}
          defaultValues={{
            vaccineWhodrugId: vaccineAdministered?.vaccineWhodrugId ?? null,
            doseNumber: vaccineAdministered?.doseNumber ?? null,
            notes: vaccineAdministered?.notes ?? null,
          }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={vaccineAdministeredErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={mutation.isPending}
          onCancel={() => handleOpenChange(false)}
          submitLabel="common.satelliteList.save"
          cancelLabel="common.satelliteList.cancel"
        >
          {(form) => <VaccineAdministeredFormFields form={form} />}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}
