import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GeoAssignment } from '@/contracts/declared/userGeoLocation';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { useActiveGeoAssignments, useReassignGeoLocation } from './api';
import { reassignGeoErrorFieldMap, reassignGeoSchema, type ReassignGeoFormValues } from './schemas';

export interface ReassignGeoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  // `null` while no row is being moved. The source travels in the URL of the `006`, not the body.
  assignment: GeoAssignment | null;
}

export function ReassignGeoDialog({
  open,
  onOpenChange,
  userId,
  assignment,
}: ReassignGeoDialogProps) {
  const { t } = useTranslation();
  const reassign = useReassignGeoLocation();
  // Same query as the add dialog's exclusion — one key, one request. Off while the dialog is
  // closed, through the factory's `enabled: !!parentId`.
  const covered = useActiveGeoAssignments(open ? userId : '').map((row) => row.geoLocationId);

  function handleOpenChange(nextOpen: boolean) {
    // CONVENTIONS.md §10.7 — the card only toggles `open`.
    if (!nextOpen) {
      reassign.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: ReassignGeoFormValues) {
    if (!assignment) {
      return;
    }
    // ESAVI-USERGEO-006 — one call. The source is closed and the target opened inside the same
    // transaction (appUserGeoLocation.service.ts:342), which closing and re-adding by hand is not.
    reassign.mutate(
      {
        userGeoLocationId: assignment.userGeoLocationId,
        data: { geoLocationId: values.geoLocationId },
      },
      {
        onSuccess: () => {
          toast.success(t('common.toast.updated'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = reassign.error instanceof EsaviApiError ? reassign.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('userGeoLocation.reassign.title')}</DialogTitle>
        </DialogHeader>

        {assignment && (
          <ResourceForm<ReassignGeoFormValues>
            key={assignment.userGeoLocationId}
            schema={reassignGeoSchema}
            defaultValues={{ geoLocationId: '' }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={reassignGeoErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={reassign.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="userGeoLocation.reassign.submit"
          >
            {(form) => (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('userGeoLocation.reassign.warning')}
                </p>

                <FormField
                  control={form.control}
                  name="geoLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('userGeoLocation.add.picker')}</FormLabel>
                      <FormControl>
                        <GeoLocationPicker
                          value={field.value || null}
                          onChange={(geoLocationId) => field.onChange(geoLocationId ?? '')}
                          // The source answers 409 USERGEO_006_SAME_GEOLOCATION and anything the
                          // user already covers answers 409 USERGEO_006_ASSIGNMENT_EXISTS — the
                          // source is in `covered` already, since it is an active row (§3.5).
                          excludeIds={covered}
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
      </DialogContent>
    </Dialog>
  );
}
