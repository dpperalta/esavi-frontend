import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationDiagnosticDetail } from '@/contracts/declared/investigationDiagnostic';
import { investigationDiagnosticResource, useInvestigationDiagnosticsByCase } from '@/features/investigation/api';
import { DiagnosticFormDialog } from '@/features/investigation/DiagnosticFormDialog';
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
import { Button } from '@/shared/components/ui/button';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
import { useCloseWhenReadOnly } from '@/shared/hooks/useCloseWhenReadOnly';

export interface DiagnosticListProps {
  caseId: string;
  // Names the investigation itself (SPEC FE13c §1.F) — the table hangs from `investigation`
  // directly, not from the clinical evaluation, so this only feeds the `POST`'s body.
  investigationId: string;
  disabled?: boolean;
  // The theoretical race of §3.6: the case's own row exists but the investigation header behind
  // it doesn't yet. `InvestigationStep.tsx` (§4 paso 8) already blocks the whole step until that
  // header exists, so this is defensive, not a state this list expects to render in practice.
  onMissingInvestigation: () => void;
}

function isInvestigationNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_INVESTIGATION_NOT_FOUND');
}

function diagnosticLabel(row: InvestigationDiagnosticDetail): string {
  return row.diagnosticRaw ?? row.diagnosticTerm?.name ?? '';
}

// Section C.17 (SPEC FE13c §4 paso 7), the counterpart of `EvaluationInstitutionList` for
// diagnoses. Now with `onDelete`: `ESAVI-INVDIAG-005A` dropped from ADMIN to USER
// (references/API-ROUTES.md, regenerated 2026-09-16; `-005B` reactivation stays ADMIN), the same
// debt as every other list of this wizard, resolved for the delete half.
export function DiagnosticList({ caseId, investigationId, disabled = false, onMissingInvestigation }: DiagnosticListProps) {
  const { t } = useTranslation();
  const diagnostics = useInvestigationDiagnosticsByCase(caseId, true);
  const deactivate = investigationDiagnosticResource.useDeactivate();
  const [dialog, setDialog] = useState<{ open: boolean; diagnostic: InvestigationDiagnosticDetail | null }>({
    open: false,
    diagnostic: null,
  });
  const [removeTarget, setRemoveTarget] = useState<InvestigationDiagnosticDetail | null>(null);
  useCloseWhenReadOnly(disabled, () => {
    setDialog((prev) => ({ ...prev, open: false }));
    setRemoveTarget(null);
  });

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.diagnosticId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<InvestigationDiagnosticDetail>[] = [
    { key: 'name', header: 'investigation.diagnostic.fields.diagnosticName', render: diagnosticLabel, card: 'primary' },
    { key: 'type', header: 'investigation.diagnostic.fields.diagnosticTypeItemId', render: (row) => row.diagnosticType?.name, card: 'secondary' },
    { key: 'date', header: 'investigation.diagnostic.fields.diagnosticDate', render: (row) => row.diagnosticDate, card: 'secondary' },
    { key: 'notes', header: 'investigation.diagnostic.fields.notes', render: (row) => row.notes },
  ];

  const missingInvestigationError =
    diagnostics.error instanceof EsaviApiError && isInvestigationNotFound(diagnostics.error)
      ? diagnostics.error
      : null;
  const isEmpty =
    !diagnostics.isLoading && !diagnostics.isError && (diagnostics.data?.rows.length ?? 0) === 0;

  if (missingInvestigationError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('investigation.diagnostic.errors.noInvestigation')}</p>
        <Button type="button" variant="outline" onClick={onMissingInvestigation}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<InvestigationDiagnosticDetail>
        titleKey="investigation.diagnostic.title"
        addLabel="investigation.diagnostic.add"
        columns={columns}
        rows={diagnostics.data?.rows ?? []}
        idField="diagnosticId"
        getRowLabel={diagnosticLabel}
        isLoading={diagnostics.isLoading}
        isError={diagnostics.isError}
        error={diagnostics.error instanceof EsaviApiError ? diagnostics.error : null}
        onRetry={() => void diagnostics.refetch()}
        onAdd={disabled ? undefined : () => setDialog({ open: true, diagnostic: null })}
        onEdit={disabled ? undefined : (row) => setDialog({ open: true, diagnostic: row })}
        onDelete={disabled ? undefined : (row) => setRemoveTarget(row)}
      />

      {isEmpty && <p className="text-sm text-muted-foreground">{t('investigation.diagnostic.empty')}</p>}

      <DiagnosticFormDialog
        open={dialog.open}
        investigationId={investigationId}
        diagnostic={dialog.diagnostic}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('investigation.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('investigation.satellites.deleteConfirm', {
                name: removeTarget ? diagnosticLabel(removeTarget) : '',
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
