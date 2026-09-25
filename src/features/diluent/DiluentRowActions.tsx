import { useTranslation } from 'react-i18next';
import type { Diluent } from '@/contracts/declared/diluent';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { FREE_TEXT_DILUENT_CODE } from './api';

export type DiluentConfirmAction = 'deactivate' | 'activate';

interface DiluentRowActionsProps {
  row: Diluent;
  onEdit: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: DiluentConfirmAction) => void;
}

// SPEC FE25a §3.1. Owns its own `useCan()` calls, same precedent as HealthFacilityRowActions.
export function DiluentRowActions({ row, onEdit, onAudit, onConfirm }: DiluentRowActionsProps) {
  const { t } = useTranslation();
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  // Hallazgo C: `002B` lists inactive rows to ADMIN, but `003` answers them 404 unless SUPERADMIN,
  // so "Editar" on an inactive row is offered only to the role that can actually load it.
  const canEdit = isAdmin && (row.isActive || isSuperAdmin);
  // SPEC FE25a §3.1: deactivating `OTHER` would break the notification step's free-text fallback.
  const isFreeTextRow = row.code === FREE_TEXT_DILUENT_CODE;
  const id = row.diluentCatalogId;

  return (
    <>
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(id)}>{t('common.actions.edit')}</DropdownMenuItem>
      )}
      {isSuperAdmin && (
        <DropdownMenuItem onClick={() => onAudit(id)}>{t('common.actions.audit')}</DropdownMenuItem>
      )}
      {/* ESAVI-DILUENT-005A */}
      {isAdmin && row.isActive && !isFreeTextRow && (
        <DropdownMenuItem variant="destructive" onClick={() => onConfirm(id, 'deactivate')}>
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {/* ESAVI-DILUENT-005B */}
      {isSuperAdmin && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(id, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}
