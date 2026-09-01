import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateCatalogItemInput } from '@/contracts/catalogItem';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { catalogItemResource } from './api';
import {
  buildUpdateCatalogItemSchema,
  catalogItemErrorFieldMap,
  createCatalogItemSchema,
  type CatalogItemUpdateFormValues,
} from './schemas';

interface CatalogItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create". Mirrors CatalogTypeFormDialog's shape.
  catalogItemId: string | null;
  // The parent type, always selected before this dialog can open (SPEC FE03 §3.1: no "Crear"
  // without a `typeId`). Only used to build the `POST` body — never a form field (SPEC FE03 §3.5).
  catalogTypeId: string;
}

export function CatalogItemFormDialog({
  open,
  onOpenChange,
  catalogItemId,
  catalogTypeId,
}: CatalogItemFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = catalogItemId !== null;
  // ESAVI-CATITEM-003 — only used in edit mode; `enabled: !!id` inside the factory skips the
  // request while creating.
  const existing = catalogItemResource.useOne(catalogItemId ?? '');
  // ESAVI-CATITEM-001 / ESAVI-CATITEM-004
  const create = catalogItemResource.useCreate();
  const update = catalogItemResource.useUpdate();
  const mutation = isEditing ? update : create;
  const isValueLocked = isEditing && !!existing.data?.isValueLocked;

  // Same reset-on-close pattern as CatalogTypeFormDialog (CONVENTIONS.md §10.7): the list page
  // keeps this dialog mounted, only toggling `open`, so a stale mutation error would otherwise
  // survive into the next attempt.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: CatalogItemUpdateFormValues) {
    if (isEditing && catalogItemId) {
      // `value` is present in `values` only when the row isn't locked — `buildUpdateCatalogItemSchema`
      // strips it from the parsed output otherwise (SPEC FE03 §3.6). The full remaining object
      // travels; the backend does the differential update.
      update.mutate(
        { id: catalogItemId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    // Validated by `createCatalogItemSchema` (name/value required) before reaching here — the
    // cast reflects that runtime guarantee, not a new assumption.
    create.mutate(
      { ...values, catalogTypeId } as CreateCatalogItemInput,
      {
        onSuccess: () => {
          toast.success(t('common.toast.created'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  // Waits for the row before mounting the form — ResourceForm snapshots `defaultValues` once,
  // and `isValueLocked` itself is only known once `existing.data` has arrived.
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'catalogItem.form.editTitle' : 'catalogItem.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<CatalogItemUpdateFormValues>
            key={catalogItemId ?? 'create'}
            // Creating validates the full `createCatalogItemSchema` (name/value required);
            // editing validates the update schema, which drops `value` entirely when the row is
            // congelada (SPEC FE03 §3.6). Both are cast to the same `TFieldValues` — the runtime
            // schema is what actually enforces the difference, not this static type.
            schema={
              isEditing
                ? buildUpdateCatalogItemSchema(isValueLocked)
                : createCatalogItemSchema
            }
            defaultValues={{
              code: existing.data?.code ?? '',
              name: existing.data?.name ?? '',
              value: existing.data?.value ?? '',
              description: existing.data?.description ?? '',
              sortOrder: existing.data?.sortOrder ?? undefined,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={catalogItemErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogItem.fields.code')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        {t(isEditing ? 'catalogItem.form.codeWarning' : 'catalogItem.form.codeHelp')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogItem.fields.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogItem.fields.value')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          disabled={isValueLocked}
                          readOnly={isValueLocked}
                        />
                      </FormControl>
                      {isValueLocked && (
                        <FormDescription>{t('catalogItem.form.valueLockedHelp')}</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogItem.fields.description')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogItem.fields.sortOrder')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          name={field.name}
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
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
