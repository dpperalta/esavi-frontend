import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotificationMedicalHistoryInput } from '@/contracts/notificationMedicalHistory';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { MeddraSearchField } from '@/shared/components/MeddraSearchField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import type { TermSearchOption } from '@/shared/components/TermSearchField';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  notificationMedicalHistoryResource,
  useMeddraSearch,
  useNotificationMedicalHistoriesByCase,
} from './api';
import {
  notificationMedicalHistoryErrorFieldMap,
  notificationMedicalHistorySchema,
  type NotificationMedicalHistoryFormValues,
} from './schemas';

export interface MedicalHistoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The list is read by case (`ESAVI-MEDHIST-006`), so the row being edited is taken from that
  // cache: SPEC FE12e §3.2 rules out the `003` by id, and §3.4 rules out copying the row into
  // state — only its id is held.
  caseId: string;
  notificationId: string;
  // `null` means «create» — same precedent as `EventFormDialog`.
  medicalHistoryId: string | null;
}

function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

function isDiagtermNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_DIAGTERM_NOT_FOUND');
}

interface MedicalHistoryFormFieldsProps {
  form: UseFormReturn<NotificationMedicalHistoryFormValues>;
  mutationError: EsaviApiError | null;
  // Resubmits the form with `historyCode`/`source` already cleared — the way out of
  // `MEDHIST_00X_DIAGTERM_NOT_FOUND` (§3.5), which is a dictionary missing from this deployment
  // and not a mistake by the person filling the form.
  onSaveAsFreeText: (values: NotificationMedicalHistoryFormValues) => void;
}

// Split from `MedicalHistoryFormDialog` for the same reason as `EventFormFields`: its hooks must
// mount and unmount with this subtree, and `<ResourceForm>` is not always rendered.
function MedicalHistoryFormFields({
  form,
  mutationError,
  onSaveAsFreeText,
}: MedicalHistoryFormFieldsProps) {
  const { t } = useTranslation();
  const [meddraQuery, setMeddraQuery] = useState('');
  const meddraSearch = useMeddraSearch(meddraQuery);

  // §3.5, the same `source` table as FE12b and FE12d: picking a suggestion pins `'MEDDRA'` and
  // never coins a term; typing a code by hand leaves an explicit `'LOCAL'`, which does coin it.
  // Editing the name afterwards touches neither — the branch follows the code's origin, not the
  // name's.
  function handleSelectMeddraTerm(option: TermSearchOption) {
    form.setValue('historyName', option.name, { shouldDirty: true });
    form.setValue('historyCode', option.code, { shouldDirty: true });
    form.setValue('source', 'MEDDRA', { shouldDirty: true });
  }

  function handleHistoryCodeChange(raw: string) {
    const trimmed = raw.trim();
    form.setValue('historyCode', trimmed || null, { shouldDirty: true });
    form.setValue('source', trimmed ? 'LOCAL' : undefined, { shouldDirty: true });
  }

  const showDiagtermNotFound = !!mutationError && isDiagtermNotFound(mutationError);

  return (
    <>
      <FormField
        control={form.control}
        name="historyName"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('notification.medicalHistory.fields.historyName')}</FormLabel>
            <FormControl>
              <MeddraSearchField
                value={field.value}
                onValueChange={field.onChange}
                onSelect={handleSelectMeddraTerm}
                onQueryChange={setMeddraQuery}
                options={meddraSearch.data?.rows ?? []}
                isLoading={meddraSearch.isLoading}
                isError={meddraSearch.isError}
                serviceUnavailableMessage={t('notification.medicalHistory.meddraUnavailable')}
                placeholder={t('notification.medicalHistory.fields.historyName')}
                ariaLabel={t('notification.medicalHistory.fields.historyName')}
              />
            </FormControl>
            {fieldState.error && (
              <p className="text-sm text-destructive">
                {t('notification.medicalHistory.validation.historyNameRequired')}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="historyCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medicalHistory.fields.historyCode')}</FormLabel>
            <FormControl>
              <Input
                value={field.value ?? ''}
                onChange={(event) => handleHistoryCodeChange(event.target.value)}
              />
            </FormControl>
            {showDiagtermNotFound && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
                <p className="text-sm text-muted-foreground">
                  {t('notification.medicalHistory.diagtermNotImported')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    onSaveAsFreeText({
                      ...form.getValues(),
                      historyCode: null,
                      source: undefined,
                    })
                  }
                >
                  {t('notification.medicalHistory.keepAsFreeText')}
                </Button>
              </div>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('notification.medicalHistory.fields.notes')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// The medical antecedent — SPEC FE12e §4 paso 10. The term is resolved on the server from
// `historyCode` and `source`; this dialog never opens `ESAVI-DIAGTERM-*` on its own (§3.2).
export function MedicalHistoryFormDialog({
  open,
  onOpenChange,
  caseId,
  notificationId,
  medicalHistoryId,
}: MedicalHistoryFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = medicalHistoryId !== null;
  const histories = useNotificationMedicalHistoriesByCase(caseId, open && isEditing);
  const existing =
    histories.data?.rows.find((row) => row.medicalHistoryId === medicalHistoryId) ?? null;
  const create = notificationMedicalHistoryResource.useCreate();
  const update = notificationMedicalHistoryResource.useUpdate();
  const mutation = isEditing ? update : create;

  // §3.3: the response carries `historyRaw` and `diagnosticTerm` separately, never a
  // `historyName`. What the field shows is `historyRaw ?? diagnosticTerm.name`, derived in render
  // from the cached row — never copied into state (§3.4, punto 1).
  const effectiveName = existing
    ? (existing.historyRaw ?? existing.diagnosticTerm?.name ?? '')
    : '';

  // CONVENTIONS.md §10.7 — the caller never unmounts this dialog, it only toggles `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotificationMedicalHistoryFormValues) {
    const historyName = values.historyName.trim();
    // The whole object travels (CONVENTIONS.md §6.5) except `historyName`, and that exception is
    // the rule of §3.3: `historyName` is only sent when the user actually changed it. Resending
    // the value the `GET` produced would overwrite the notifier's own text with an echo of the
    // master's name on every save that touched nothing.
    const payload: Partial<CreateNotificationMedicalHistoryInput> = {
      historyCode: values.historyCode ?? null,
      source: values.source,
      notes: values.notes ?? null,
    };

    if (isEditing && medicalHistoryId) {
      update.mutate(
        {
          id: medicalHistoryId,
          data: historyName === effectiveName ? payload : { ...payload, historyName },
        },
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
      { ...payload, historyName, notificationId },
      {
        onSuccess: () => {
          toast.success(t('common.toast.created'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    // Not a mistake by the user: the dictionary of that source is not imported in this
    // deployment. `MedicalHistoryFormFields` already explains it next to the code field, with the
    // free-text way out — a toast here would repeat it (§3.5).
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
  const readyToRender = !isEditing || !!existing;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              isEditing
                ? 'notification.medicalHistory.form.editTitle'
                : 'notification.medicalHistory.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotificationMedicalHistoryFormValues>
            key={medicalHistoryId ?? 'create'}
            schema={notificationMedicalHistorySchema}
            defaultValues={{
              historyName: effectiveName,
              historyCode: existing?.diagnosticTerm?.code ?? null,
              source: existing?.diagnosticTerm?.source,
              notes: existing?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notificationMedicalHistoryErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => (
              <MedicalHistoryFormFields
                form={form}
                mutationError={mutationError}
                onSaveAsFreeText={handleSubmit}
              />
            )}
          </ResourceForm>
        )}
        {!readyToRender && (
          <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
