import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { catalogItemResource } from './api';

interface CatalogItemAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItemId: string | null;
}

// Lateral on desktop, bottom on mobile (SPEC FE03 §3.10) — <AuditTrail> already renders its own
// visible heading, so the Radix title here is `sr-only`: it exists for the accessibility tree,
// not to duplicate the heading on screen.
export function CatalogItemAuditSheet({
  open,
  onOpenChange,
  catalogItemId,
}: CatalogItemAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-CATITEM-003 — reads `appDetails` from the same cached row the list already has; only
  // hits the network the first time this catalogItemId opens the sheet.
  const { data } = catalogItemResource.useOne(catalogItemId ?? '');

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
