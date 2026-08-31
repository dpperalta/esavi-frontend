import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
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
import { catalogTypeResource } from './api';
import {
  catalogTypeErrorFieldMap,
  createCatalogTypeSchema,
  type CatalogTypeFormValues,
} from './schemas';

interface CatalogTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create". The same schema and the same visible fields serve both modes
  // (SPEC FE02 §3.6: "un solo formulario") — `name` stays required in both.
  catalogTypeId: string | null;
}

export function CatalogTypeFormDialog({
  open,
  onOpenChange,
  catalogTypeId,
}: CatalogTypeFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = catalogTypeId !== null;
  // ESAVI-CATTYPE-003 — only used in edit mode; `enabled: !!id` inside the factory skips the
  // request entirely while creating.
  const existing = catalogTypeResource.useOne(catalogTypeId ?? '');
  // ESAVI-CATTYPE-001 / ESAVI-CATTYPE-004
  const create = catalogTypeResource.useCreate();
  const update = catalogTypeResource.useUpdate();
  const mutation = isEditing ? update : create;

  function handleSubmit(values: CatalogTypeFormValues) {
    if (isEditing && catalogTypeId) {
      // The full object travels; the backend does the differential update and never `isActive`
      // — this payload never carries it (CONVENTIONS.md §6.5, SPEC FE02 §7).
      update.mutate(
        { id: catalogTypeId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            onOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(values, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        onOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  // Waits for the row before mounting the form — <ResourceForm> snapshots `defaultValues` once
  // (SPEC FE02 §3.5), so it can't pick up an async row after the fact.
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'catalogType.form.editTitle' : 'catalogType.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<CatalogTypeFormValues>
            key={catalogTypeId ?? 'create'}
            schema={createCatalogTypeSchema}
            defaultValues={{
              code: existing.data?.code ?? '',
              name: existing.data?.name ?? '',
              description: existing.data?.description ?? '',
              sortOrder: existing.data?.sortOrder ?? undefined,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={catalogTypeErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => onOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogType.fields.code')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        {t(isEditing ? 'catalogType.form.codeWarning' : 'catalogType.form.codeHelp')}
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
                      <FormLabel>{t('catalogType.fields.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalogType.fields.description')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
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
                      <FormLabel>{t('catalogType.fields.sortOrder')}</FormLabel>
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
