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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { geoLevelTypeResource } from './api';
import {
  createGeoLevelTypeSchema,
  geoLevelTypeErrorFieldMap,
  type GeoLevelTypeFormValues,
} from './schemas';

interface GeoLevelTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create" — same schema and visible fields serve both modes.
  geoLevelTypeId: string | null;
}

export function GeoLevelTypeFormDialog({
  open,
  onOpenChange,
  geoLevelTypeId,
}: GeoLevelTypeFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = geoLevelTypeId !== null;
  // ESAVI-GEOLVL-003 — only used in edit mode; `enabled: !!id` inside the factory skips the
  // request entirely while creating.
  const existing = geoLevelTypeResource.useOne(geoLevelTypeId ?? '');
  // ESAVI-GEOLVL-001 / ESAVI-GEOLVL-004
  const create = geoLevelTypeResource.useCreate();
  const update = geoLevelTypeResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — the list page never unmounts this dialog, only toggles `open`, so a
  // failed mutation's `error` outlives the close unless reset here.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: GeoLevelTypeFormValues) {
    if (isEditing && geoLevelTypeId) {
      // Full object travels; the backend does the differential update (CONVENTIONS.md §6.5).
      update.mutate(
        { id: geoLevelTypeId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(values, {
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
  // Waits for the row before mounting the form — <ResourceForm> snapshots `defaultValues` once.
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'geoLevelType.form.editTitle' : 'geoLevelType.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<GeoLevelTypeFormValues>
            key={geoLevelTypeId ?? 'create'}
            schema={createGeoLevelTypeSchema}
            defaultValues={{
              code: existing.data?.code ?? '',
              name: existing.data?.name ?? '',
              sortOrder: existing.data?.sortOrder ?? undefined,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={geoLevelTypeErrorFieldMap}
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
                      <FormLabel>{t('geoLevelType.fields.code')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLevelType.fields.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel>{t('geoLevelType.fields.sortOrder')}</FormLabel>
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
