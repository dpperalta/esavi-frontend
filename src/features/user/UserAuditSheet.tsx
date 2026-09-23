import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { userResource } from './api';

interface UserAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

// Lateral on desktop, bottom on mobile, and reached only with SUPERADMIN — the guard lives in the
// row menu of the listing (CONVENTIONS.md §10.4: no entity relaxes that).
//
// ESAVI-USER-003, not the row the listing already holds: `toUserListRow` deletes `appDetails` from
// the rows of 002A/002B (user.service.ts:63-67), so the trail only exists on the detail read.
export function UserAuditSheet({ open, onOpenChange, userId }: UserAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data } = userResource.useOne(userId ?? '');

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
