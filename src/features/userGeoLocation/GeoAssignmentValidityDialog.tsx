import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GeoAssignment } from '@/contracts/declared/userGeoLocation';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { useUpdateGeoValidity } from './api';
import {
  composeValidFrom,
  composeValidTo,
  updateGeoValidityErrorFieldMap,
  updateGeoValiditySchema,
  type UpdateGeoValidityFormValues,
} from './schemas';

// The two columns are timestamptz and the field chooses a day, so the instant is cut back to the
// day it belongs to. Local, never UTC: `toISOString().slice(0, 10)` would move a row stamped at
// 23:00 to the following day (§3.5).
function toIsoDay(value: string | null): string | null {
  if (!value) return null;
  const instant = new Date(value);
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${instant.getFullYear()}-${month}-${day}`;
}

export interface GeoAssignmentValidityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` while no row is being edited. The row travels whole because the listing already has
  // it: ESAVI-USERGEO-003 would only add the `user`, which is the one on this page (§3.2).
  assignment: GeoAssignment | null;
}

export function GeoAssignmentValidityDialog({
  open,
  onOpenChange,
  assignment,
}: GeoAssignmentValidityDialogProps) {
  const { t } = useTranslation();
  const update = useUpdateGeoValidity();

  function handleOpenChange(nextOpen: boolean) {
    // CONVENTIONS.md §10.7 — the card only toggles `open`, so a previous error would be reapplied
    // to the next, blank form.
    if (!nextOpen) {
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: UpdateGeoValidityFormValues) {
    if (!assignment) {
      return;
    }
    // ESAVI-USERGEO-004 accepts these two fields and nothing else: `userId` or `geoLocationId` in
    // the body answer 400 (§3.2, note 3).
    update.mutate(
      {
        id: assignment.userGeoLocationId,
        data: {
          validFrom: values.validFrom ? composeValidFrom(values.validFrom) : undefined,
          validTo: values.validTo ? composeValidTo(values.validTo) : null,
        },
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

  const mutationError = update.error instanceof EsaviApiError ? update.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('userGeoLocation.validity.title')}</DialogTitle>
        </DialogHeader>

        {assignment && (
          <ResourceForm<UpdateGeoValidityFormValues>
            // Remounted per row: the same dialog instance serves every row of the listing, and
            // without this the second row would open with the first one's dates.
            key={assignment.userGeoLocationId}
            schema={updateGeoValiditySchema}
            defaultValues={{
              validFrom: toIsoDay(assignment.validFrom),
              validTo: toIsoDay(assignment.validTo),
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={updateGeoValidityErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={update.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="userGeoLocation.validity.submit"
          >
            {(form) => (
              <>
                <p className="text-sm text-muted-foreground">{assignment.geoLocation.name}</p>

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
                      <p className="text-xs text-muted-foreground">
                        {t('userGeoLocation.validity.open')}
                      </p>
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
