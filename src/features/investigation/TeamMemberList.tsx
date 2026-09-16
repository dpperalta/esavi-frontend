import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InvestigationTeamMemberDetail } from '@/contracts/declared/investigationTeamMember';
import { investigationTeamMemberResource } from '@/features/investigation/api';
import { TeamMemberFormDialog } from '@/features/investigation/TeamMemberFormDialog';
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

export interface TeamMemberListProps {
  investigationId: string;
  // Closed case (SPEC FE08, §3.6 of step 5's other satellites): no "Añadir" and no edit action.
  disabled?: boolean;
}

function teamMemberLabel(row: InvestigationTeamMemberDetail): string {
  return row.fullName;
}

// Section A2 of step 5 (SPEC FE13a §3.5 D, §2). Built on `<SatelliteList>`, with `onDelete` now
// that `ESAVI-INVTEAM-005A` dropped from ADMIN to USER (references/API-ROUTES.md, regenerated
// 2026-09-16) — the same debt from `CASE-PROCESS.md` §10 that used to block delete here, resolved.
// `phone` carries no `card`: it shows in the desktop table but not the mobile card, which shows
// only name, institution and email (§4 step 10, acceptance criterion).
export function TeamMemberList({ investigationId, disabled }: TeamMemberListProps) {
  const { t } = useTranslation();
  const members = investigationTeamMemberResource.useListByParent!(investigationId, {
    pageSize: 100,
  });
  const deactivate = investigationTeamMemberResource.useDeactivate();
  const [dialog, setDialog] = useState<{ open: boolean; memberId: string | null }>({
    open: false,
    memberId: null,
  });
  const [removeTarget, setRemoveTarget] = useState<InvestigationTeamMemberDetail | null>(null);

  function handleConfirmRemove() {
    if (!removeTarget) return;
    deactivate.mutate(removeTarget.investigationTeamMemberId, {
      onSuccess: () => setRemoveTarget(null),
      onError: (error) => {
        setRemoveTarget(null);
        toast.error(error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'));
      },
    });
  }

  const columns: SatelliteListColumn<InvestigationTeamMemberDetail>[] = [
    {
      key: 'fullName',
      header: 'investigation.team.field.fullName',
      render: (row) => row.fullName,
      card: 'primary',
    },
    {
      key: 'institutionName',
      header: 'investigation.team.field.institutionName',
      render: (row) => row.institutionName,
      card: 'secondary',
    },
    {
      key: 'email',
      header: 'investigation.team.field.email',
      render: (row) => row.email,
      card: 'secondary',
    },
    {
      key: 'phone',
      header: 'investigation.team.field.phone',
      render: (row) => row.phone,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SatelliteList<InvestigationTeamMemberDetail>
        titleKey="investigation.team.sectionTitle"
        columns={columns}
        rows={members.data?.rows ?? []}
        idField="investigationTeamMemberId"
        getRowLabel={teamMemberLabel}
        isLoading={members.isLoading}
        isError={members.isError}
        error={members.error instanceof EsaviApiError ? members.error : null}
        onRetry={() => void members.refetch()}
        onAdd={disabled ? undefined : () => setDialog({ open: true, memberId: null })}
        onEdit={
          disabled
            ? undefined
            : (row) => setDialog({ open: true, memberId: row.investigationTeamMemberId })
        }
        onDelete={disabled ? undefined : (row) => setRemoveTarget(row)}
      />

      <TeamMemberFormDialog
        open={dialog.open}
        investigationId={investigationId}
        memberId={dialog.memberId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('investigation.satellites.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('investigation.satellites.deleteConfirm', {
                name: removeTarget ? teamMemberLabel(removeTarget) : '',
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
