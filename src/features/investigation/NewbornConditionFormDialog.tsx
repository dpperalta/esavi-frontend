import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateInvestigationPregnancyConditionInput } from '@/contracts/investigationPregnancyCondition';
import { useMeddraSearch } from '@/features/notification/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { MeddraSearchField } from '@/shared/components/MeddraSearchField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { investigationPregnancyConditionResource } from './api';
import {
  newbornConditionErrorFieldMap,
  newbornConditionSaveSchema,
  type NewbornConditionFormValues,
} from './schemas';

export interface NewbornConditionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investigationId: string;
  // `null` significa «crear» — mismo precedente que `PregnancyComplicationFormDialog`.
  conditionId: string | null;
  // La carrera de §3.5 B: la ficha de antecedentes desapareció entre que la lista cargó y este
  // diálogo intentó escribir. No es un error del formulario — el llamador cambia a su propio
  // estado «Falta la ficha», con el botón que la vuelve a abrir.
  onMissingHistory: () => void;
}

function isMedicalHistoryNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_MEDICAL_HISTORY_NOT_FOUND');
}

interface NewbornConditionFormFieldsProps {
  form: UseFormReturn<NewbornConditionFormValues>;
}

// Separado del diálogo por el mismo motivo que `PregnancyComplicationFormFields`: sus hooks
// tienen que montarse y desmontarse con este subárbol, no aparecer de golpe en un render
// posterior mientras `existing.data` todavía no resolvió en modo edición.
function NewbornConditionFormFields({ form }: NewbornConditionFormFieldsProps) {
  const { t } = useTranslation();
  const [meddraQuery, setMeddraQuery] = useState('');
  const meddraSearch = useMeddraSearch(meddraQuery);

  // Mismo criterio que `EventFormFields`/`PregnancyComplicationFormFields` (SPEC FE13b §3.5 B):
  // una sugerencia del buscador deja `source: 'MEDDRA'`; escribir el código a mano lo deja en
  // `'LOCAL'`, explícito.
  function handleSelectMeddraTerm(option: TermSearchOption) {
    form.setValue('conditionName', option.name, { shouldDirty: true });
    form.setValue('conditionCode', option.code, { shouldDirty: true });
    form.setValue('source', 'MEDDRA', { shouldDirty: true });
  }

  function handleConditionCodeChange(raw: string) {
    const trimmed = raw.trim();
    form.setValue('conditionCode', trimmed || null, { shouldDirty: true });
    form.setValue('source', trimmed ? 'LOCAL' : undefined, { shouldDirty: true });
  }

  return (
    <>
      <FormField
        control={form.control}
        name="conditionName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.newbornCondition.term')}</FormLabel>
            <FormControl>
              <MeddraSearchField
                value={field.value}
                onValueChange={field.onChange}
                onSelect={handleSelectMeddraTerm}
                onQueryChange={setMeddraQuery}
                options={meddraSearch.data?.rows ?? []}
                isLoading={meddraSearch.isLoading}
                isError={meddraSearch.isError}
                serviceUnavailableMessage={t('investigation.newbornCondition.meddraUnavailable')}
                placeholder={t('investigation.newbornCondition.term')}
                ariaLabel={t('investigation.newbornCondition.term')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="conditionCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.newbornCondition.conditionCode')}</FormLabel>
            <FormControl>
              <Input
                value={field.value ?? ''}
                onChange={(event) => handleConditionCodeChange(event.target.value)}
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
            <FormLabel>{t('investigation.fields.notes')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// El diálogo de §3.5 B (SPEC FE13b §4 paso 7): la plantilla de `PregnancyComplicationFormDialog`
// sin el `<CatalogSelect>` de tipo — esta tabla no tiene columna de tipo. A diferencia de la
// complicación, `_DIAGTERM_NOT_FOUND` y `_ALREADY_EXISTS` sí anclan en `conditionName`
// (`newbornConditionErrorFieldMap`, `schemas.ts`): no hay una segunda rama de "guardar como texto
// libre", el mensaje del backend ya llega traducido junto al campo.
export function NewbornConditionFormDialog({
  open,
  onOpenChange,
  investigationId,
  conditionId,
  onMissingHistory,
}: NewbornConditionFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = conditionId !== null;
  const existing = investigationPregnancyConditionResource.useOne(conditionId ?? '');
  const create = investigationPregnancyConditionResource.useCreate();
  const update = investigationPregnancyConditionResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NewbornConditionFormValues) {
    // El objeto completo viaja siempre (§3.5 B, CONVENTIONS.md §6.5); `conditionName` sólo se
    // reenvía si el investigador la tocó de verdad — lo que se muestra es
    // `conditionRaw ?? diagnosticTerm.name`, y reenviar el nombre del maestro sin querer lo
    // convertiría en un `conditionRaw` que dice lo mismo (§3.5 B).
    const payload: Partial<CreateInvestigationPregnancyConditionInput> = {
      conditionName: values.conditionName.trim(),
      conditionCode: values.conditionCode ?? null,
      source: values.source,
      notes: values.notes ?? null,
    };

    if (isEditing && conditionId) {
      update.mutate(
        { id: conditionId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
          onError: (error) => {
            if (error instanceof EsaviApiError && isMedicalHistoryNotFound(error)) {
              handleOpenChange(false);
              onMissingHistory();
            }
          },
        },
      );
      return;
    }
    create.mutate({ ...payload, investigationId } as CreateInvestigationPregnancyConditionInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError && isMedicalHistoryNotFound(error)) {
          handleOpenChange(false);
          onMissingHistory();
        }
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    // La carrera de la nieta ya se maneja en el `onError` del `mutate` de arriba, antes de que
    // `ResourceForm` decida si el código está mapeado — llegar aquí con ese código significaría
    // que `onMissingHistory` ya corrió. Cualquier otro código sin mapear sí es un error genérico.
    if (isMedicalHistoryNotFound(error)) {
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
                ? 'investigation.newbornCondition.form.editTitle'
                : 'investigation.newbornCondition.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NewbornConditionFormValues>
            key={conditionId ?? 'create'}
            schema={newbornConditionSaveSchema}
            defaultValues={{
              conditionName: existing.data?.conditionRaw ?? existing.data?.diagnosticTerm?.name ?? '',
              conditionCode: existing.data?.diagnosticTerm?.code ?? null,
              notes: existing.data?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={newbornConditionErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => <NewbornConditionFormFields form={form} />}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}
