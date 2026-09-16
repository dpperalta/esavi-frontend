import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvestigationPregnancyConditionDetail } from '@/contracts/declared/investigationPregnancyCondition';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
import { Button } from '@/shared/components/ui/button';
import { investigationMedicalHistoryResource, useNewbornConditionsByMedicalHistory } from './api';
import { NewbornConditionFormDialog } from './NewbornConditionFormDialog';

export interface NewbornConditionListProps {
  investigationId: string;
  // Expediente cerrado (§3.6, mismo criterio que `TeamMemberList`): sin «Añadir» y sin acciones de
  // fila.
  disabled?: boolean;
}

function conditionLabel(row: InvestigationPregnancyConditionDetail): string {
  return row.conditionRaw ?? row.diagnosticTerm?.name ?? '';
}

// La sección B2 (SPEC FE13b §4 paso 7), montada sólo con
// `pregnancyOutcome.value === 'LIVE_BORN_WITH_COMPLICATIONS'`
// (`PregnancySection` decide eso, no este componente). Sobre `<SatelliteList>`, igual que
// `TeamMemberList` y `PregnancyComplicationList` — pero **sin botón de borrar** (§2): que un
// `USER` pueda retirar una condición que él cargó depende de que `ESAVI-INVPREG-005A` baje de
// `ADMIN`, la deuda de §10 de `CASE-PROCESS.md` que comparte con `INVTEAM-005A`.
export function NewbornConditionList({ investigationId, disabled = false }: NewbornConditionListProps) {
  const { t } = useTranslation();
  const conditions = useNewbornConditionsByMedicalHistory(investigationId, true);
  const openMedicalHistory = investigationMedicalHistoryResource.useCreate();

  const [dialog, setDialog] = useState<{ open: boolean; conditionId: string | null }>({
    open: false,
    conditionId: null,
  });
  // La carrera de la nieta (§3.5 B, §3.6): la ficha de antecedentes desapareció entre que esta
  // lista cargó y el diálogo intentó escribir. Reemplaza la lista entera — no hay nada que listar
  // sin una ficha a la que colgarse.
  const [missingHistory, setMissingHistory] = useState(false);

  if (missingHistory) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {t('investigation.newbornCondition.missingHistory')}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={openMedicalHistory.isPending}
          onClick={() =>
            openMedicalHistory.mutate(
              { investigationId },
              { onSuccess: () => setMissingHistory(false) },
            )
          }
        >
          {t('investigation.newbornCondition.createHistory')}
        </Button>
      </div>
    );
  }

  const columns: SatelliteListColumn<InvestigationPregnancyConditionDetail>[] = [
    {
      key: 'conditionName',
      header: 'investigation.newbornCondition.term',
      render: conditionLabel,
      card: 'primary',
    },
    {
      key: 'notes',
      header: 'investigation.fields.notes',
      render: (row) => row.notes,
      card: 'secondary',
    },
  ];

  const isEmpty =
    !conditions.isLoading && !conditions.isError && (conditions.data?.rows.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<InvestigationPregnancyConditionDetail>
        titleKey="investigation.newbornCondition.title"
        addLabel="investigation.newbornCondition.add"
        columns={columns}
        rows={conditions.data?.rows ?? []}
        idField="pregnancyConditionId"
        getRowLabel={conditionLabel}
        isLoading={conditions.isLoading}
        isError={conditions.isError}
        error={conditions.error instanceof EsaviApiError ? conditions.error : null}
        onRetry={() => void conditions.refetch()}
        onAdd={disabled ? undefined : () => setDialog({ open: true, conditionId: null })}
        onEdit={disabled ? undefined : (row) => setDialog({ open: true, conditionId: row.pregnancyConditionId })}
      />

      {/* Único texto de estado vacío entre las catorce listas satélite (§3.6): B2 es contenido
        clínico, no un formulario en blanco — «sin filtros» se dice para que el silencio no se
        confunda con el olvido (§3.6). */}
      {isEmpty && (
        <p className="text-sm text-muted-foreground">{t('investigation.newbornCondition.empty')}</p>
      )}

      <NewbornConditionFormDialog
        open={dialog.open}
        investigationId={investigationId}
        conditionId={dialog.conditionId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        onMissingHistory={() => setMissingHistory(true)}
      />
    </div>
  );
}
