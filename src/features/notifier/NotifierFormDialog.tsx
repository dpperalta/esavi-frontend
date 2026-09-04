import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateNotifierInput } from '@/contracts/notifier';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { notifierResource } from './api';
import { createNotifierSchema, notifierErrorFieldMap, type NotifierFormValues } from './schemas';

export interface NotifierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  // `null` means "create" — same schema and visible fields serve both modes (§3.1, precedent of
  // `HealthFacilityFormDialog`). `caseId` only travels on create: the `004` ignores it even if
  // sent (SPEC FE10 §3.5), so the update payload never carries it.
  notifierId: string | null;
}

export function NotifierFormDialog({ open, onOpenChange, caseId, notifierId }: NotifierFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = notifierId !== null;
  const existing = notifierResource.useOne(notifierId ?? '');
  const create = notifierResource.useCreate();
  const update = notifierResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — the caller never unmounts this dialog, only toggles `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: NotifierFormValues) {
    if (isEditing && notifierId) {
      update.mutate(
        { id: notifierId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate({ ...values, caseId } satisfies CreateNotifierInput, {
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
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(isEditing ? 'notifier.form.editTitle' : 'notifier.form.createTitle')}</DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<NotifierFormValues>
            key={notifierId ?? 'create'}
            schema={createNotifierSchema}
            defaultValues={{
              firstName: existing.data?.firstName ?? '',
              lastName: existing.data?.lastName ?? '',
              professionItemId: existing.data?.profession?.catalogItemId ?? null,
              geoLocationId: existing.data?.geoLocation?.geoLocationId ?? null,
              room: existing.data?.room ?? '',
              address: existing.data?.address ?? '',
              phoneNumber: existing.data?.phoneNumber ?? '',
              email: existing.data?.email ?? '',
              details: existing.data?.details ?? '',
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={notifierErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.firstName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.lastName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="professionItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.professionItemId')}</FormLabel>
                      <FormControl>
                        <CatalogSelect
                          typeCode="profession"
                          emit="id"
                          value={field.value ?? null}
                          onChange={field.onChange}
                          ariaLabel={t('notifier.fields.professionItemId')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="geoLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.geoLocationId')}</FormLabel>
                      <FormControl>
                        <GeoLocationPicker value={field.value ?? null} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="room"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.room')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.address')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.phoneNumber')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="details"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notifier.fields.details')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ''} />
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
