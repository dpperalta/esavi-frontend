import { useState } from 'react';
import type { InvestigationTeamMemberDetail } from '@/contracts/declared/investigationTeamMember';
import { investigationTeamMemberResource } from '@/features/investigation/api';
import { TeamMemberFormDialog } from '@/features/investigation/TeamMemberFormDialog';
import { EsaviApiError } from '@/shared/api/types';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';

export interface TeamMemberListProps {
  investigationId: string;
  // Expediente cerrado (SPEC FE08, §3.6 de los demás satélites del paso 5): sin «Añadir» y sin
  // acción de editar.
  disabled?: boolean;
}

function teamMemberLabel(row: InvestigationTeamMemberDetail): string {
  return row.fullName;
}

// Sección A2 del paso 5 (SPEC FE13a §3.5 D, §2). Sobre `<SatelliteList>`, sin `onDelete`: la
// operación de baja de este listado exige ADMIN mientras las catorce entidades del paso 5
// escriben como USER — el botón no se pinta hasta que ese requisito de rol baje (misma deuda de
// `CASE-PROCESS.md` §10 que bloqueó el borrado en FE12b y FE12c). `phone` no lleva `card`: sale
// en la tabla de escritorio pero no en la tarjeta móvil, que muestra sólo nombre, institución y
// correo (§4 paso 10, criterio de aceptación).
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
