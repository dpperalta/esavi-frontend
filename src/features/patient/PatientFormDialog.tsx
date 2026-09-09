import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { useCatalogItemsByTypeCode } from '@/shared/hooks/useCatalogItemsByTypeCode';
import { usePregnancyBlockGuard } from '@/shared/hooks/usePregnancyBlockGuard';
import { PregnancyBlockDialog } from '@/features/notification/PregnancyBlockDialog';
import { PatientForm } from './PatientForm';
import { patientResource } from './api';
import { createPatientSchema, patientErrorFieldMap, type PatientFormValues } from './schemas';

export interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  // El bloqueo de SPEC FE12d §4 paso 13 necesita el caso para leer si hay datos de embarazo
  // cargados — ausente cuando este diálogo se usa fuera de un caso (ninguno de los llamadores
  // actuales lo hace, pero el prop queda opcional en vez de forzar un `caseId` que no siempre
  // existe). Sin él, el guard nunca bloquea: no hay compuerta que cerrar sin caso.
  caseId?: string;
}

// The edit modal of ESAVI-PATIENT-004 (SPEC FE10 §3.1). Unlike `HealthFacilityFormDialog`, there
// is no "null means create" mode here: the inline alta of `PatientStep` renders `<PatientForm>`
// directly, without this dialog's chrome — the two contexts share the fields, not the container.
export function PatientFormDialog({ open, onOpenChange, patientId, caseId }: PatientFormDialogProps) {
  const { t } = useTranslation();
  const existing = patientResource.useOne(patientId);
  const update = patientResource.useUpdate();
  const sexCatalog = useCatalogItemsByTypeCode('sex');
  const guard = usePregnancyBlockGuard(caseId);

  // El diálogo de bloqueo de §4 paso 13, encima del formulario — que se queda montado con lo que
  // el usuario tecleó, sin cerrarse: «Primero se vacía, viéndolo; después se corrige al paciente»
  // (CASE-PROCESS.md §7.4) es un segundo clic en «Guardar», no un reintento automático.
  const [blockDialog, setBlockDialog] = useState<{ open: boolean; reason: 'sex' | 'age' | null }>({
    open: false,
    reason: null,
  });

  // CONVENTIONS.md §10.7 — the caller never unmounts this dialog, only toggles `open`, so a
  // failed mutation's `error` would outlive the close and reapply to the next open unless reset
  // here.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function performUpdate(values: PatientFormValues) {
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

  function handleSubmit(values: PatientFormValues) {
    // El bloqueo de los pasos 1 y 2 (CASE-PROCESS.md §7.4, SPEC FE12d §4 paso 13): mientras haya
    // datos de embarazo, un cambio que cerraría la compuerta no se guarda. Se evalúa contra lo que
    // se está a punto de enviar, no contra un diff — es más simple y da el mismo resultado, porque
    // un valor sin tocar nunca cierra una compuerta que ya estaba abierta con esos mismos datos.
    if (guard.hasPregnancyData) {
      const candidateSex = values.sexItemId
        ? (sexCatalog.rows.find((row) => row.catalogItemId === values.sexItemId) ?? null)
        : null;
      const closes = guard.wouldCloseGate({
        sex: candidateSex ? { catalogItemId: candidateSex.catalogItemId, value: candidateSex.value } : null,
        birthDate: values.birthDate,
      });
      if (closes) {
        setBlockDialog({ open: true, reason: candidateSex?.value === 'MALE' ? 'sex' : 'age' });
        return;
      }
    }
    performUpdate(values);
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  function handleClearBlock() {
    guard.clearBlock(() => {
      toast.success(t('notification.pregnancy.gate.cleared'));
      setBlockDialog({ open: false, reason: null });
    });
  }

  const mutationError = update.error instanceof EsaviApiError ? update.error : null;
  // Waits for the row before mounting the form — <ResourceForm> snapshots `defaultValues` once.
  const readyToRender = !!existing.data;

  return (
    <>
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
              isSubmitting={update.isPending || (!!caseId && !guard.isReady)}
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

      <PregnancyBlockDialog
        open={blockDialog.open}
        onOpenChange={(next) => setBlockDialog((prev) => ({ ...prev, open: next }))}
        reason={blockDialog.reason}
        activeComplicationsCount={guard.activeComplicationsCount}
        onClear={handleClearBlock}
        isClearing={guard.isClearing}
      />
    </>
  );
}
