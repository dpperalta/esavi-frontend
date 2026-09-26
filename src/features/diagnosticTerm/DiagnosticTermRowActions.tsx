import { useTranslation } from 'react-i18next';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

export type DiagnosticTermConfirmAction = 'deactivate' | 'activate';

interface DiagnosticTermRowActionsProps {
  row: DiagnosticTerm;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: DiagnosticTermConfirmAction) => void;
}

// SPEC FE25b §3.1, the same rule as SPEC FE25a §3.1. Owns its own `useCan()` calls.
export function DiagnosticTermRowActions({
  row,
  onEdit,
  onAudit,
  onConfirm,
}: DiagnosticTermRowActionsProps) {
  const { t } = useTranslation();
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  // SPEC FE25b §1.D: `002B` lists inactive rows to ADMIN, but `003` answers them 404 unless
  // SUPERADMIN, so "Editar" on an inactive row is offered only to the role that can load it.
  const canEdit = isAdmin && (row.isActive || isSuperAdmin);
  const id = row.diagnosticTermId;

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(id)}>{t('common.actions.edit')}</DropdownMenuItem>
      )}
      {isSuperAdmin && (
        <DropdownMenuItem onClick={() => onAudit(id)}>{t('common.actions.audit')}</DropdownMenuItem>
      )}
      {/* ESAVI-DIAGTERM-005A */}
      {isAdmin && row.isActive && (
        <DropdownMenuItem variant="destructive" onClick={() => onConfirm(id, 'deactivate')}>
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {/* ESAVI-DIAGTERM-005B */}
      {isSuperAdmin && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(id, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}
