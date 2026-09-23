import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { BulkAssignGeoLocationsInput } from '@/contracts/appUserGeoLocation';
import { geoLocationResource } from '@/features/geoLocation/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
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
import { toast } from 'sonner';
import { useActiveGeoAssignments, useBulkAssignGeoLocations } from './api';
import {
  bulkAssignGeoErrorFieldMap,
  bulkAssignGeoSchema,
  composeValidFrom,
  composeValidTo,
  type BulkAssignGeoFormValues,
} from './schemas';

interface SelectedLocationProps {
  geoLocationId: string;
  onRemove: (geoLocationId: string) => void;
}

// The picker emits an id, not a name, and the preview has to be readable. `useOne` is the
// geoLocation catalog's own read, cached 30 minutes (CONVENTIONS.md §6.3).
function SelectedLocation({ geoLocationId, onRemove }: SelectedLocationProps) {
  const { t } = useTranslation();
  const location = geoLocationResource.useOne(geoLocationId);
  const name = location.data?.name ?? geoLocationId;

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
      <span className="min-w-0 break-words text-sm text-foreground">{name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={t('userGeoLocation.add.remove', { name })}
        onClick={() => onRemove(geoLocationId)}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

export interface AddGeoAssignmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function AddGeoAssignmentsDialog({
  open,
  onOpenChange,
  userId,
}: AddGeoAssignmentsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bulkAssign = useBulkAssignGeoLocations();
  // An empty `parentId` keeps the factory's own `enabled: !!parentId` off, so the listing is not
  // read while the dialog is closed — the same technique as `useNewbornConditionsByMedicalHistory`.
  const assignedIds = useActiveGeoAssignments(open ? userId : '').map((row) => row.geoLocationId);

  const [picked, setPicked] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    // CONVENTIONS.md §10.7 — the card never unmounts this dialog, only toggles `open`, so the
    // mutation's error would survive the close and land on the next, blank form.
    if (!nextOpen) {
      bulkAssign.reset();
      setPicked(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: BulkAssignGeoFormValues) {
    // Sent without `validFrom`/`validTo` when nobody chose a day: the service puts `now()` and an
    // open-ended validity, which is not the same as sending today's midnight (§3.5).
    const input: BulkAssignGeoLocationsInput = {
      userId,
      geoLocationIds: values.geoLocationIds,
      ...(values.validFrom ? { validFrom: composeValidFrom(values.validFrom) } : {}),
      ...(values.validTo ? { validTo: composeValidTo(values.validTo) } : {}),
    };
    bulkAssign.mutate(input, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    if (error.code === 'USERGEO_007_ASSIGNMENT_EXISTS') {
      // The picker's exclusion was stale: someone else assigned one of these pairs. Never retried
      // on its own — the second attempt has to start from what is there now (§7).
      void queryClient.invalidateQueries({ queryKey: ['userGeoLocation'] });
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = bulkAssign.error instanceof EsaviApiError ? bulkAssign.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('userGeoLocation.add.title')}</DialogTitle>
        </DialogHeader>

        <ResourceForm<BulkAssignGeoFormValues>
          schema={bulkAssignGeoSchema}
          defaultValues={{ geoLocationIds: [], validFrom: null, validTo: null }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={bulkAssignGeoErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={bulkAssign.isPending}
          onCancel={() => handleOpenChange(false)}
          submitLabel="userGeoLocation.add.submit"
        >
          {(form) => {
            const selected = form.watch('geoLocationIds');

            function addPicked() {
              if (!picked || selected.includes(picked)) {
                return;
              }
              form.setValue('geoLocationIds', [...selected, picked], { shouldValidate: true });
              setPicked(null);
            }

            function removeSelected(geoLocationId: string) {
              form.setValue(
                'geoLocationIds',
                selected.filter((id) => id !== geoLocationId),
                { shouldValidate: true },
              );
            }

            return (
              <>
                <FormField
                  control={form.control}
                  name="geoLocationIds"
                  render={() => (
                    <FormItem>
                      <FormLabel>{t('userGeoLocation.add.picker')}</FormLabel>
                      <FormControl>
                        <GeoLocationPicker
                          value={picked}
                          onChange={setPicked}
                          // What the user already covers, plus what is already in the preview:
                          // both would abort the whole batch with a 409 (§3.5).
                          excludeIds={[...assignedIds, ...selected]}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {t('userGeoLocation.add.alreadyAssigned')}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!picked}
                        onClick={addPicked}
                      >
                        {t('userGeoLocation.add.toList')}
                      </Button>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selected.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('userGeoLocation.add.selected')}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {selected.map((geoLocationId) => (
                        <SelectedLocation
                          key={geoLocationId}
                          geoLocationId={geoLocationId}
                          onRemove={removeSelected}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {/* One validity for the whole batch: the `007` accepts the pair once, not per
                    location, so different validities are two saves (§3.5). */}
                <FormField
                  control={form.control}
                  name="validFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('userGeoLocation.validity.from')}</FormLabel>
                      <FormControl>
                        <DateField
                          value={field.value}
                          onChange={field.onChange}
                          ariaLabel={t('userGeoLocation.validity.from')}
                          allowFuture
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="validTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('userGeoLocation.validity.to')}</FormLabel>
                      <FormControl>
                        <DateField
                          value={field.value}
                          onChange={field.onChange}
                          ariaLabel={t('userGeoLocation.validity.to')}
                          allowFuture
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            );
          }}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}
