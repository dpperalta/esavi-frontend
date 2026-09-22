import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationPregnancyConditionDetail } from '@/contracts/declared/investigationPregnancyCondition';
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
import { Button } from '@/shared/components/ui/button';
import { useCloseWhenReadOnly } from '@/shared/hooks/useCloseWhenReadOnly';
import {
  investigationMedicalHistoryResource,
  investigationPregnancyConditionResource,
  useNewbornConditionsByMedicalHistory,
} from './api';
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
// `TeamMemberList` y `PregnancyComplicationList` — now with `onDelete`: `ESAVI-INVPREG-005A`
// dropped from `ADMIN` to `USER` (references/API-ROUTES.md, regenerated 2026-09-16), the same
// `CASE-PROCESS.md` §10 debt it shared with `INVTEAM-005A`, resolved.
export function NewbornConditionList({ investigationId, disabled = false }: NewbornConditionListProps) {
  const { t } = useTranslation();
  const conditions = useNewbornConditionsByMedicalHistory(investigationId, true);
  const openMedicalHistory = investigationMedicalHistoryResource.useCreate();
  const deactivate = investigationPregnancyConditionResource.useDeactivate();

  const [dialog, setDialog] = useState<{ open: boolean; conditionId: string | null }>({
    open: false,
    conditionId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<InvestigationPregnancyConditionDetail | null>(
    null,
  );
  useCloseWhenReadOnly(disabled, () => {
    setDialog((prev) => ({ ...prev, open: false }));
    setRemoveTarget(null);
  });

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.pregnancyConditionId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }
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
        onDelete={disabled ? undefined : (row) => setRemoveTarget(row)}
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

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('investigation.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('investigation.satellites.deleteConfirm', {
                name: removeTarget ? conditionLabel(removeTarget) : '',
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
