import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateHealthFacilityInput } from '@/contracts/healthFacility';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/features/catalogItem/CatalogSelect';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
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
import { Skeleton } from '@/shared/components/ui/skeleton';
import { healthFacilityResource } from './api';
import {
  createHealthFacilitySchema,
  healthFacilityErrorFieldMap,
  type HealthFacilityFormValues,
} from './schemas';

interface HealthFacilityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create" — same schema and visible fields serve both modes.
  healthFacilityId: string | null;
}

interface HealthFacilityParentSelectProps {
  geoLocationId: string;
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
}

// SPEC FE06 §3.7: the parent combo follows the *form's own* `geoLocationId`, not the list's
// filter — a private helper local to this dialog, same "not every combo needs its own file"
// precedent as `GeoLocationPickerLevel` inside `GeoLocationPicker.tsx`. Active facilities only
// (`useListByParent` without `includeInactive`), and the backend already rejects self-parent and
// circular chains (hallazgo E) — the client doesn't replicate that check.
function HealthFacilityParentSelect({
  geoLocationId,
  value,
  onValueChange,
  onClear,
}: HealthFacilityParentSelectProps) {
  const { t } = useTranslation();
  const list = healthFacilityResource.useListByParent?.(geoLocationId, { pageSize: 100 });

  if (!geoLocationId) {
    return (
      <Select value="" disabled>
        <SelectTrigger
          className="w-full"
          aria-label={t('healthFacility.fields.parentHealthFacilityId')}
        >
          <SelectValue placeholder={t('healthFacility.parent.needsLocation')} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (list?.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (list?.isError) {
    const message =
      list.error instanceof EsaviApiError
        ? getErrorMessage(list.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const rows = list?.data?.rows ?? [];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className="w-full"
        aria-label={t('healthFacility.fields.parentHealthFacilityId')}
        onClear={onClear}
      >
        <SelectValue placeholder={t('healthFacility.parent.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.healthFacilityId} value={row.healthFacilityId}>
            {row.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function HealthFacilityFormDialog({
  open,
  onOpenChange,
  healthFacilityId,
}: HealthFacilityFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = healthFacilityId !== null;
  // ESAVI-HFAC-003 — only used in edit mode; `enabled: !!id` inside the factory skips the
  // request while creating.
  const existing = healthFacilityResource.useOne(healthFacilityId ?? '');
  // ESAVI-HFAC-001 / ESAVI-HFAC-004
  const create = healthFacilityResource.useCreate();
  const update = healthFacilityResource.useUpdate();
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

  function handleSubmit(values: HealthFacilityFormValues) {
    if (isEditing && healthFacilityId) {
      // Full object travels; the backend does the differential update (CONVENTIONS.md §6.5) —
      // saving without touching anything produces no `UPDATE`, not even for the coordinates.
      update.mutate(
        { id: healthFacilityId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(values as CreateHealthFacilityInput, {
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
            {t(isEditing ? 'healthFacility.form.editTitle' : 'healthFacility.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<HealthFacilityFormValues>
            key={healthFacilityId ?? 'create'}
            // The backend sends the whole `PUT` body regardless of what changed (CONVENTIONS.md
            // §6.5) — both modes validate against the full schema, same precedent as
            // `GeoLocationFormDialog`. `updateHealthFacilitySchema` exists for callers that need
            // a genuinely partial shape (none here).
            schema={createHealthFacilitySchema}
            defaultValues={{
              geoLocationId: existing.data?.geoLocationId ?? '',
              name: existing.data?.name ?? '',
              facilityTypeItemId: existing.data?.facilityTypeItemId ?? '',
              parentHealthFacilityId: existing.data?.parentHealthFacilityId ?? '',
              localCode: existing.data?.localCode ?? '',
              officialName: existing.data?.officialName ?? '',
              shortName: existing.data?.shortName ?? '',
              address: existing.data?.address ?? '',
              // The row's `latitude`/`longitude` travel as strings (hallazgo I) — coerced to
              // number here so the value matches the schema's post-coerce output type; the
              // schema itself coerces user input on submit.
              latitude: existing.data?.latitude ? Number(existing.data.latitude) : undefined,
              longitude: existing.data?.longitude ? Number(existing.data.longitude) : undefined,
              phone: existing.data?.phone ?? '',
              email: existing.data?.email ?? '',
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={healthFacilityErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="geoLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('healthFacility.fields.geoLocationId')}</FormLabel>
                      <FormControl>
                        <GeoLocationPicker
                          value={field.value || null}
                          onChange={(nextValue) => {
                            field.onChange(nextValue ?? '');
                            // A parent candidate belongs to the previous location — an unrelated
                            // location change invalidates it rather than leaving a stale pair.
                            form.setValue('parentHealthFacilityId', '');
                          }}
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
                      <FormLabel>{t('healthFacility.fields.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="facilityTypeItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('healthFacility.fields.facilityTypeItemId')}</FormLabel>
                      <FormControl>
                        <CatalogSelect
                          typeCode="healthFacilityType"
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          onClear={() => field.onChange('')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="parentHealthFacilityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('healthFacility.fields.parentHealthFacilityId')}</FormLabel>
                      <FormControl>
                        <HealthFacilityParentSelect
                          geoLocationId={form.watch('geoLocationId')}
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          onClear={() => field.onChange('')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="localCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('healthFacility.fields.localCode')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
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
                      <FormLabel>{t('healthFacility.fields.officialName')}</FormLabel>
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
                      <FormLabel>{t('healthFacility.fields.shortName')}</FormLabel>
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
                      <FormLabel>{t('healthFacility.fields.address')}</FormLabel>
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
                      <FormLabel>{t('healthFacility.fields.latitude')}</FormLabel>
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
                      <FormLabel>{t('healthFacility.fields.longitude')}</FormLabel>
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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('healthFacility.fields.phone')}</FormLabel>
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
                      <FormLabel>{t('healthFacility.fields.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value ?? ''} />
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
