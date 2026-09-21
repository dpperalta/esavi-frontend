import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { EvaluationInstitutionDetail } from '@/contracts/declared/evaluationInstitution';
import { evaluationInstitutionResource, useEvaluationInstitutionsByInvestigation } from '@/features/investigation/api';
import { EvaluationInstitutionFormDialog } from '@/features/investigation/EvaluationInstitutionFormDialog';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
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
import { useCloseWhenReadOnly } from '@/shared/hooks/useCloseWhenReadOnly';

export interface EvaluationInstitutionListProps {
  // Names the clinical evaluation ficha, whose PK equals `investigation.investigationId`
  // (SPEC FE13c §1.B) — the same value `ClinicalEvaluationSection` receives.
  investigationId: string;
  // Expediente cerrado (§3.6, same criterion as `TeamMemberList`): no «Añadir» and no edit action.
  disabled?: boolean;
}

function institutionLabel(row: EvaluationInstitutionDetail): string {
  return row.institutionName ?? row.healthFacility?.name ?? '';
}

// Section C.7 (SPEC FE13c §4 paso 6), built on `<SatelliteList>` like every other satellite list
// of the wizard — now with `onDelete`: `ESAVI-EVALINST-005A` dropped from ADMIN to USER
// (references/API-ROUTES.md, regenerated 2026-09-16), the same debt as `TeamMemberList` and
// `NewbornConditionList`, resolved. No missing-ficha guard here — unlike `NewbornConditionList`,
// this list only mounts once `InvestigationStep.tsx` (§4 paso 8) confirms the clinical evaluation
// ficha exists, so the 404 of §3.2/§7 riesgo E is a write race the dialog resolves on its own, not
// a state this list has to render.
export function EvaluationInstitutionList({ investigationId, disabled = false }: EvaluationInstitutionListProps) {
  const { t } = useTranslation();
  const institutions = useEvaluationInstitutionsByInvestigation(investigationId, true);
  const deactivate = evaluationInstitutionResource.useDeactivate();
  const [dialog, setDialog] = useState<{ open: boolean; institution: EvaluationInstitutionDetail | null }>({
    open: false,
    institution: null,
  });
  const [removeTarget, setRemoveTarget] = useState<EvaluationInstitutionDetail | null>(null);
  useCloseWhenReadOnly(disabled, () => {
    setDialog((prev) => ({ ...prev, open: false }));
    setRemoveTarget(null);
  });

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.evaluationInstitutionId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<EvaluationInstitutionDetail>[] = [
    {
      key: 'name',
      header: 'investigation.evaluationInstitution.fields.institutionName',
      render: institutionLabel,
      card: 'primary',
    },
    {
      // The field's own label is the literal C.7 question (§3.5 B) — appropriate above the
      // selector in the dialog, but the table header only has room for a short word: the same
      // "fields label vs. column header" split `healthFacility.columns.type` already uses.
      key: 'type',
      header: 'investigation.evaluationInstitution.columns.type',
      render: (row) => row.institutionType?.name,
      card: 'secondary',
    },
    {
      key: 'personContact',
      header: 'investigation.evaluationInstitution.fields.personContact',
      render: (row) => row.personContact,
      card: 'secondary',
    },
    {
      key: 'personName',
      header: 'investigation.evaluationInstitution.fields.personName',
      render: (row) => row.personName,
    },
    // `notes` is deliberately absent from the list — free text with no length cap widens the
    // table without limit. It's still fully editable, just only from the edit dialog.
  ];

  const isEmpty =
    !institutions.isLoading && !institutions.isError && (institutions.data?.rows.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<EvaluationInstitutionDetail>
        titleKey="investigation.evaluationInstitution.title"
        addLabel="investigation.evaluationInstitution.add"
        columns={columns}
        rows={institutions.data?.rows ?? []}
        idField="evaluationInstitutionId"
        getRowLabel={institutionLabel}
        isLoading={institutions.isLoading}
        isError={institutions.isError}
        error={institutions.error instanceof EsaviApiError ? institutions.error : null}
        onRetry={() => void institutions.refetch()}
        onAdd={disabled ? undefined : () => setDialog({ open: true, institution: null })}
        onEdit={disabled ? undefined : (row) => setDialog({ open: true, institution: row })}
        onDelete={disabled ? undefined : (row) => setRemoveTarget(row)}
      />

      {isEmpty && (
        <p className="text-sm text-muted-foreground">{t('investigation.evaluationInstitution.empty')}</p>
      )}

      <EvaluationInstitutionFormDialog
        open={dialog.open}
        investigationId={investigationId}
        institution={dialog.institution}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('investigation.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('investigation.satellites.deleteConfirm', {
                name: removeTarget ? institutionLabel(removeTarget) : '',
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
