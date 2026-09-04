import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { PatientForm } from './PatientForm';
import { patientResource } from './api';
import { createPatientSchema, patientErrorFieldMap, type PatientFormValues } from './schemas';

export interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
}

// The edit modal of ESAVI-PATIENT-004 (SPEC FE10 §3.1). Unlike `HealthFacilityFormDialog`, there
// is no "null means create" mode here: the inline alta of `PatientStep` renders `<PatientForm>`
// directly, without this dialog's chrome — the two contexts share the fields, not the container.
export function PatientFormDialog({ open, onOpenChange, patientId }: PatientFormDialogProps) {
  const { t } = useTranslation();
  const existing = patientResource.useOne(patientId);
  const update = patientResource.useUpdate();

  // CONVENTIONS.md §10.7 — the caller never unmounts this dialog, only toggles `open`, so a
  // failed mutation's `error` would outlive the close and reapply to the next open unless reset
  // here.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: PatientFormValues) {
    update.mutate(
      { id: patientId, data: values },
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
  // Waits for the row before mounting the form — <ResourceForm> snapshots `defaultValues` once.
  const readyToRender = !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('patient.form.editTitle')}</DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<PatientFormValues>
            key={patientId}
            schema={createPatientSchema}
            defaultValues={{
              names: existing.data?.names ?? '',
              lastNames: existing.data?.lastNames ?? '',
              documentNumber: existing.data?.documentNumber ?? '',
              passportNumber: existing.data?.passportNumber ?? '',
              birthDate: existing.data?.birthDate ?? null,
              email: existing.data?.email ?? '',
              phoneNumber: existing.data?.phoneNumber ?? '',
              sexItemId: existing.data?.sex?.catalogItemId ?? null,
              residenceGeoLocationId: existing.data?.residence?.geoLocationId ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={patientErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={update.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => <PatientForm form={form} />}
          </ResourceForm>
        )}
        {!readyToRender && (
          <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
