import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { useAppRoleDetail } from './api';

interface AppRoleAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string | null;
}

// Lateral on desktop, bottom on mobile, and reached only with SUPERADMIN — the guard lives in the
// row menu of the listing (CONVENTIONS.md §10.4: no entity relaxes that).
//
// ESAVI-APPROLE-003 rather than the row the listing already holds: the listing does carry
// appDetails here (only sysDetails is excluded, appRole.service.ts:11), but reading it fresh is
// what makes the trail show the edit that was just saved without waiting for a refetch.
export function AppRoleAuditSheet({ open, onOpenChange, roleId }: AppRoleAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data } = useAppRoleDetail(roleId ?? '', open);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">{t('common.audit.title')}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <AuditTrail appDetails={data?.appDetails ?? null} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
