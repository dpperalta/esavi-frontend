import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

export type VaccineWhodrugConfirmAction = 'deactivate' | 'activate';

interface VaccineWhodrugRowActionsProps {
  row: VaccineWhodrugDetail;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: VaccineWhodrugConfirmAction) => void;
}

// SPEC FE25c §3.1, the rule of SPEC FE25a §3.1 plus «Ver». Owns its own `useCan()` calls.
export function VaccineWhodrugRowActions({
  row,
  onAudit,
  onConfirm,
}: VaccineWhodrugRowActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const id = row.vaccineWhodrugId;
  // `002B` lists inactive rows to ADMIN, but `003` answers them 404 unless SUPERADMIN, so «Ver» and
  // «Editar» follow the same rule (§3.1). USER never sees inactive rows.
  const canOpen = row.isActive || isSuperAdmin;

  return (
    <>
      {/* ESAVI-WHODRUG-003 */}
      {canOpen && (
        <DropdownMenuItem onClick={() => navigate(`/whodrug-vaccines/${id}`)}>
          {t('vaccineWhodrug.actions.view')}
        </DropdownMenuItem>
      )}
      {/* ESAVI-WHODRUG-003 + ESAVI-WHODRUG-004 */}
      {isAdmin && canOpen && (
        <DropdownMenuItem onClick={() => navigate(`/whodrug-vaccines/${id}/edit`)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {isSuperAdmin && (
        <DropdownMenuItem onClick={() => onAudit(id)}>{t('common.actions.audit')}</DropdownMenuItem>
      )}
      {/* ESAVI-WHODRUG-005A */}
      {isAdmin && row.isActive && (
        <DropdownMenuItem variant="destructive" onClick={() => onConfirm(id, 'deactivate')}>
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {/* ESAVI-WHODRUG-005B */}
      {isSuperAdmin && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(id, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}
