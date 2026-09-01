import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { geoLevelTypeResource } from '@/features/geoLevelType/api';
import { geoLocationResource } from './api';
import {
  createGeoLocationSchema,
  geoLocationErrorFieldMap,
  type GeoLocationFormValues,
} from './schemas';

interface GeoLocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create" — same schema and visible fields serve both modes.
  geoLocationId: string | null;
}

export function GeoLocationFormDialog({
  open,
  onOpenChange,
  geoLocationId,
}: GeoLocationFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = geoLocationId !== null;
  // ESAVI-GEOLOC-003 — only used in edit mode; `enabled: !!id` inside the factory skips the
  // request entirely while creating.
  const existing = geoLocationResource.useOne(geoLocationId ?? '');
  // Reused from cache (staleTime 30 min) — the same query the list page's level combo/column use.
  const levelTypes = geoLevelTypeResource.useList({ pageSize: 100 });
  // ESAVI-GEOLOC-001 / ESAVI-GEOLOC-004
  const create = geoLocationResource.useCreate();
  const update = geoLocationResource.useUpdate();
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

  function handleSubmit(values: GeoLocationFormValues) {
    if (isEditing && geoLocationId) {
      // Full object travels; the backend does the differential update (CONVENTIONS.md §6.5).
      update.mutate(
        { id: geoLocationId, data: values },
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
  // Waits for the row (and the level combo) before mounting the form — <ResourceForm> snapshots
  // `defaultValues` once.
  const readyToRender = (!isEditing || !!existing.data) && !levelTypes.isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'geoLocation.form.editTitle' : 'geoLocation.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<GeoLocationFormValues>
            key={geoLocationId ?? 'create'}
            schema={createGeoLocationSchema}
            defaultValues={{
              geoLevelTypeId: existing.data?.geoLevelTypeId ?? '',
              parentGeoLocationId: existing.data?.parentGeoLocationId ?? null,
              name: existing.data?.name ?? '',
              externalCode: existing.data?.externalCode ?? '',
              officialName: existing.data?.officialName ?? '',
              shortName: existing.data?.shortName ?? '',
              isoCode: existing.data?.isoCode ?? '',
              latitude: existing.data?.latitude ?? undefined,
              longitude: existing.data?.longitude ?? undefined,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={geoLocationErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="geoLevelTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.geoLevelTypeId')}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(nextValue) => {
                          field.onChange(nextValue);
                          // Changing the level can invalidate a parent already chosen for the
                          // previous level (it could now be too deep, or the same level as the
                          // new selection) — reset it rather than leave an inconsistent pair.
                          form.setValue('parentGeoLocationId', null);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(levelTypes.data?.rows ?? []).map((row) => (
                            <SelectItem key={row.geoLevelTypeId} value={row.geoLevelTypeId}>
                              {row.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="parentGeoLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.parentGeoLocationId')}</FormLabel>
                      <FormControl>
                        <GeoLocationPicker
                          value={field.value ?? null}
                          onChange={field.onChange}
                          // Hallazgo E — excludes its own subtree only in edit mode.
                          excludeSubtreeOf={geoLocationId ?? undefined}
                          // The parent's cascade stops one level short of the level chosen above
                          // — never offer a same-level or deeper location as the parent.
                          maxLevelTypeId={form.watch('geoLevelTypeId') || undefined}
                        />
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
                      <FormLabel>{t('geoLocation.fields.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="externalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.externalCode')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="officialName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.officialName')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shortName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.shortName')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isoCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.isoCode')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.latitude')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
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
                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('geoLocation.fields.longitude')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
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
