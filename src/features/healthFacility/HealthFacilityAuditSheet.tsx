import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { healthFacilityResource } from './api';

interface HealthFacilityAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  healthFacilityId: string | null;
}

// Lateral on desktop, bottom on mobile (SPEC FE06 §3.9) — <AuditTrail> already renders its own
// visible heading, so the Radix title here is `sr-only`. Reached only with SUPERADMIN
// (`useCan(ROLE_LEVELS.SUPERADMIN)` in the list page, CONVENTIONS.md §10.4).
export function HealthFacilityAuditSheet({
  open,
  onOpenChange,
  healthFacilityId,
}: HealthFacilityAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-HFAC-003 — same cached row the form dialog's `useOne` may already hold for this id.
  const { data } = healthFacilityResource.useOne(healthFacilityId ?? '');

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
