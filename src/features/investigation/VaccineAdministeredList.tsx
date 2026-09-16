import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationVaccineAdministeredDetail } from '@/contracts/declared/investigationVaccineAdministered';
import { investigationVaccineAdministeredResource, useWhodrugDictionaryAvailable } from '@/features/investigation/api';
import { VaccineAdministeredFormDialog } from '@/features/investigation/VaccineAdministeredFormDialog';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';

export interface VaccineAdministeredListProps {
  investigationId: string;
  disabled?: boolean;
}

// El nombre resuelto del árbol — lo único que este spec pinta de las 28 columnas del maestro
// (SPEC FE13d §3.7, hallazgo del paso 1: `vaccineWhodrug` no viaja anidado con los cinco niveles,
// `drugName` ya es el nombre completo de la selección resuelta).
function vaccineLabel(row: InvestigationVaccineAdministeredDetail): string {
  return row.vaccineWhodrug?.drugName ?? '';
}

// Sección D.1–D.2 del paso 5 (SPEC FE13d §3.5, §4 paso 7): la única lista del expediente sin
// rama cruda, y por eso la única que se deshabilita entera con su motivo en vez de mostrarse
// vacía cuando el maestro WHODrug no está importado (§1.B, §3.6). Now with `onDelete`:
// `ESAVI-INVVACAD-005A` dropped from `ADMIN` to `USER` (references/API-ROUTES.md, regenerated
// 2026-09-16; `-005B` reactivation stays `ADMIN`), the same `CASE-PROCESS.md` §10 debt the rest
// of this expediente's lists shared.
export function VaccineAdministeredList({ investigationId, disabled = false }: VaccineAdministeredListProps) {
  const { t } = useTranslation();
  const vaccines = investigationVaccineAdministeredResource.useListByParent!(investigationId, {
    pageSize: 100,
  });
  const deactivate = investigationVaccineAdministeredResource.useDeactivate();
  const dictionary = useWhodrugDictionaryAvailable();
  const [dialog, setDialog] = useState<{
    open: boolean;
    vaccineAdministered: InvestigationVaccineAdministeredDetail | null;
  }>({ open: false, vaccineAdministered: null });
  const [removeTarget, setRemoveTarget] = useState<InvestigationVaccineAdministeredDetail | null>(
    null,
  );

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.vaccineAdministeredId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<InvestigationVaccineAdministeredDetail>[] = [
    {
      key: 'vaccine',
      header: 'investigation.vaccinesAdministered.field.vaccine',
      render: (row) => {
        const label = vaccineLabel(row);
        return (
          <span title={label} className="line-clamp-1">
            {label}
          </span>
        );
      },
      card: 'primary',
      className: 'max-w-[20rem]',
    },
    {
      key: 'doseNumber',
      header: 'investigation.vaccinesAdministered.field.doseNumber',
      render: (row) => row.doseNumber,
      card: 'secondary',
    },
    {
      key: 'notes',
      header: 'investigation.vaccinesAdministered.field.notes',
      render: (row) => row.notes,
    },
  ];

  const rows = vaccines.data?.rows ?? [];
  const isEmpty = !vaccines.isLoading && !vaccines.isError && rows.length === 0;
  // `isAvailable` empieza `undefined` mientras el sondeo está en vuelo: se trata como disponible
  // por defecto para no parpadear el motivo en cada reentrada — sólo `false` deshabilita la
  // sección (SPEC FE13d §3.6, el estado de "Carga" lo cubre el propio `isLoading` de la lista).
  const dictionaryUnavailable = dictionary.isAvailable === false;
  const canAdd = !disabled && !dictionaryUnavailable;

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<InvestigationVaccineAdministeredDetail>
        titleKey="investigation.vaccinesAdministered.title"
        addLabel="investigation.vaccinesAdministered.add"
        columns={columns}
        rows={rows}
        idField="vaccineAdministeredId"
        getRowLabel={vaccineLabel}
        isLoading={vaccines.isLoading}
        isError={vaccines.isError}
        error={vaccines.error instanceof EsaviApiError ? vaccines.error : null}
        onRetry={() => void vaccines.refetch()}
        onAdd={canAdd ? () => setDialog({ open: true, vaccineAdministered: null }) : undefined}
        onEdit={disabled ? undefined : (row) => setDialog({ open: true, vaccineAdministered: row })}
        onDelete={disabled ? undefined : (row) => setRemoveTarget(row)}
      />

      {/* Sección deshabilitada con su motivo, no una lista vacía (§3.5, §3.6) — el sondeo del
          primer nivel del árbol es el único candidato, y va antes que el vacío genérico porque
          explica algo que el vacío no puede: la sección no admite nada hasta que se importe. */}
      {dictionaryUnavailable && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t('investigation.vaccinesAdministered.dictionaryMissing')}
        </p>
      )}
      {!dictionaryUnavailable && isEmpty && (
        <p className="text-sm text-muted-foreground">{t('investigation.vaccinesAdministered.empty')}</p>
      )}

      <VaccineAdministeredFormDialog
        open={dialog.open}
        investigationId={investigationId}
        vaccineAdministered={dialog.vaccineAdministered}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('investigation.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('investigation.satellites.deleteConfirm', {
                name: removeTarget ? vaccineLabel(removeTarget) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemove}>
              {t('investigation.satellites.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
