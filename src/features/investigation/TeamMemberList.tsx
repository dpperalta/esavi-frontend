import { useState } from 'react';
import type { InvestigationTeamMemberDetail } from '@/contracts/declared/investigationTeamMember';
import { investigationTeamMemberResource } from '@/features/investigation/api';
import { TeamMemberFormDialog } from '@/features/investigation/TeamMemberFormDialog';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';

export interface TeamMemberListProps {
  investigationId: string;
  // Closed case (SPEC FE08, §3.6 of step 5's other satellites): no "Añadir" and no edit action.
  disabled?: boolean;
}

function teamMemberLabel(row: InvestigationTeamMemberDetail): string {
  return row.fullName;
}

// Section A2 of step 5 (SPEC FE13a §3.5 D, §2). Built on `<SatelliteList>`, without `onDelete`:
// this listing's delete operation requires ADMIN while step 5's fourteen entities write as USER
// — the button doesn't render until that role requirement comes down (same debt from
// `CASE-PROCESS.md` §10 that blocked delete in FE12b and FE12c). `phone` carries no `card`: it
// shows in the desktop table but not the mobile card, which shows only name, institution and
// email (§4 step 10, acceptance criterion).
export function TeamMemberList({ investigationId, disabled }: TeamMemberListProps) {
  const members = investigationTeamMemberResource.useListByParent!(investigationId, {
    pageSize: 100,
  });
  const [dialog, setDialog] = useState<{ open: boolean; memberId: string | null }>({
    open: false,
    memberId: null,
  });

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
      />

      <TeamMemberFormDialog
        open={dialog.open}
        investigationId={investigationId}
        memberId={dialog.memberId}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />
    </div>
  );
}
