import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvaluationInstitutionDetail } from '@/contracts/declared/evaluationInstitution';
import { useEvaluationInstitutionsByInvestigation } from '@/features/investigation/api';
import { EvaluationInstitutionFormDialog } from '@/features/investigation/EvaluationInstitutionFormDialog';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';

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
// of the wizard — but without `onDelete`: `ESAVI-EVALINST-005A` requires ADMIN while step 5 writes
// as USER (§2, same debt as `TeamMemberList` and `NewbornConditionList`). No missing-ficha guard
// here — unlike `NewbornConditionList`, this list only mounts once `InvestigationStep.tsx` (§4
// paso 8) confirms the clinical evaluation ficha exists, so the 404 of §3.2/§7 riesgo E is a write
// race the dialog resolves on its own, not a state this list has to render.
export function EvaluationInstitutionList({ investigationId, disabled = false }: EvaluationInstitutionListProps) {
  const { t } = useTranslation();
  const institutions = useEvaluationInstitutionsByInvestigation(investigationId, true);
  const [dialog, setDialog] = useState<{ open: boolean; institution: EvaluationInstitutionDetail | null }>({
    open: false,
    institution: null,
  });

  const columns: SatelliteListColumn<EvaluationInstitutionDetail>[] = [
    {
      key: 'name',
      header: 'investigation.evaluationInstitution.fields.institutionName',
      render: institutionLabel,
      card: 'primary',
    },
    {
      key: 'type',
      header: 'investigation.evaluationInstitution.fields.evaluationInstitutionTypeItemId',
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
    {
      key: 'notes',
      header: 'investigation.evaluationInstitution.fields.notes',
      render: (row) => row.notes,
    },
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
    </div>
  );
}
