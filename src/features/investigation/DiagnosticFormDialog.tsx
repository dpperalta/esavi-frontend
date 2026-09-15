import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateInvestigationDiagnosticInput } from '@/contracts/investigationDiagnostic';
import type { InvestigationDiagnosticDetail } from '@/contracts/declared/investigationDiagnostic';
import { investigationDiagnosticResource } from '@/features/investigation/api';
import {
  investigationDiagnosticErrorFieldMap,
  investigationDiagnosticSaveSchema,
  type InvestigationDiagnosticFormValues,
} from '@/features/investigation/schemas';
import { useMeddraSearch } from '@/features/notification/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { MeddraSearchField } from '@/shared/components/MeddraSearchField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';

export interface DiagnosticFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Names the investigation itself (SPEC FE13c §1.F), not a satellite the way the institution's
  // does — this diagnosis table hangs directly from `investigation`.
  investigationId: string;
  // The full row when editing, `null` when adding — the list already brought it down through
  // `-006`, so a second read by id isn't part of this spec's route table (§3.2, same precedent as
  // `EvaluationInstitutionFormDialog`).
  diagnostic: InvestigationDiagnosticDetail | null;
}

interface DiagnosticFormFieldsProps {
  form: UseFormReturn<InvestigationDiagnosticFormValues>;
}

// Separado del diálogo por el mismo motivo que `EventFormFields`/`NewbornConditionFormFields`:
// el `useState`/`useMeddraSearch` del buscador tiene que montarse y desmontarse con este
// subárbol.
function DiagnosticFormFields({ form }: DiagnosticFormFieldsProps) {
  const { t } = useTranslation();
  const [meddraQuery, setMeddraQuery] = useState('');
  const meddraSearch = useMeddraSearch(meddraQuery);

  // Same criterion as every other term picker of the wizard (SPEC FE13c §3.5 C): a fixed
  // suggestion leaves `source: 'MEDDRA'`; typing the code by hand leaves it in `'LOCAL'`,
  // explicit.
  function handleSelectMeddraTerm(option: TermSearchOption) {
    form.setValue('diagnosticName', option.name, { shouldDirty: true });
    form.setValue('diagnosticCode', option.code, { shouldDirty: true });
    form.setValue('source', 'MEDDRA', { shouldDirty: true });
  }

  function handleDiagnosticCodeChange(raw: string) {
    const trimmed = raw.trim();
    form.setValue('diagnosticCode', trimmed || null, { shouldDirty: true });
    form.setValue('source', trimmed ? 'LOCAL' : undefined, { shouldDirty: true });
  }

  return (
    <>
      <FormField
        control={form.control}
        name="diagnosticName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.diagnostic.fields.diagnosticName')}</FormLabel>
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
                placeholder={t('investigation.diagnostic.fields.diagnosticName')}
                ariaLabel={t('investigation.diagnostic.fields.diagnosticName')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="diagnosticCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.diagnostic.fields.diagnosticCode')}</FormLabel>
            <FormControl>
              <Input
                value={field.value ?? ''}
                onChange={(event) => handleDiagnosticCodeChange(event.target.value)}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="diagnosticDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.diagnostic.fields.diagnosticDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.diagnostic.fields.diagnosticDate')}
                allowFuture={false}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="diagnosticTypeItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.diagnostic.fields.diagnosticTypeItemId')}</FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="diagnosticType"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.diagnostic.fields.diagnosticTypeItemId')}
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
            <FormLabel>{t('investigation.diagnostic.fields.notes')}</FormLabel>
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

// Create/edit dialog for C.17 (SPEC FE13c §3.5 C, §4 paso 7) — the twin of `EventFormDialog`
// minus `isMainEsavi`/`isOtherEsavi`, over `investigationDiagnostic` instead of
// `notificationEvent`. No delete action here either (§2), same debt as `DiagnosticList`.
export function DiagnosticFormDialog({ open, onOpenChange, investigationId, diagnostic }: DiagnosticFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = diagnostic !== null;
  const create = investigationDiagnosticResource.useCreate();
  const update = investigationDiagnosticResource.useUpdate();
  const mutation = isEditing ? update : create;
  // What the list shows and what the GET never carries back as its own field (SPEC FE13c §3.5 C,
  // §1.F) — the same trap FE12b closed for `esaviName`. Compared verbatim against the submitted
  // value so an edit that never touches the term never resends `diagnosticName`.
  const initialDiagnosticName = diagnostic?.diagnosticRaw ?? diagnostic?.diagnosticTerm?.name ?? '';

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: InvestigationDiagnosticFormValues) {
    const nameChanged = !isEditing || values.diagnosticName.trim() !== initialDiagnosticName;
    const payload: Partial<CreateInvestigationDiagnosticInput> = {
      ...(nameChanged
        ? {
            diagnosticName: values.diagnosticName.trim(),
            diagnosticCode: values.diagnosticCode ?? null,
            source: values.source,
          }
        : {}),
      diagnosticDate: values.diagnosticDate ?? null,
      diagnosticTypeItemId: values.diagnosticTypeItemId ?? null,
      notes: values.notes ?? null,
    };

    if (isEditing && diagnostic) {
      update.mutate(
        { id: diagnostic.diagnosticId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate({ ...payload, investigationId } as CreateInvestigationDiagnosticInput, {
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
            {t(isEditing ? 'investigation.diagnostic.form.editTitle' : 'investigation.diagnostic.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <ResourceForm<InvestigationDiagnosticFormValues>
          key={diagnostic?.diagnosticId ?? 'create'}
          schema={investigationDiagnosticSaveSchema}
          defaultValues={{
            diagnosticName: initialDiagnosticName,
            diagnosticCode: diagnostic?.diagnosticTerm?.code ?? null,
            source: diagnostic?.diagnosticTerm?.source ?? undefined,
            diagnosticDate: diagnostic?.diagnosticDate ?? null,
            diagnosticTypeItemId: diagnostic?.diagnosticTypeItemId ?? null,
            notes: diagnostic?.notes ?? null,
          }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={investigationDiagnosticErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={mutation.isPending}
          onCancel={() => handleOpenChange(false)}
          submitLabel="common.satelliteList.save"
          cancelLabel="common.satelliteList.cancel"
        >
          {(form) => <DiagnosticFormFields form={form} />}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}
