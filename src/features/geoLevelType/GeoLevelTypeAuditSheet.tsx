import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { geoLevelTypeResource } from './api';

interface GeoLevelTypeAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geoLevelTypeId: string | null;
}

// Lateral on desktop, bottom on mobile (SPEC FE04 §3.9) — <AuditTrail> already renders its own
// visible heading, so the Radix title here is `sr-only`.
export function GeoLevelTypeAuditSheet({
  open,
  onOpenChange,
  geoLevelTypeId,
}: GeoLevelTypeAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-GEOLVL-003 — reads `appDetails` from the same cached row the list already has.
  const { data } = geoLevelTypeResource.useOne(geoLevelTypeId ?? '');

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
