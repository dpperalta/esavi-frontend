import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { vaccineWhodrugResource } from './api';

interface VaccineWhodrugAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaccineWhodrugId: string | null;
}

// Same shape as DiagnosticTermAuditSheet: <AuditTrail> renders its own visible heading, so the
// Radix title is `sr-only`. Reached only with SUPERADMIN (CONVENTIONS.md §10.4), which is also the
// only role the `003` answers for an inactive row (SPEC FE25c §3.1).
export function VaccineWhodrugAuditSheet({
  open,
  onOpenChange,
  vaccineWhodrugId,
}: VaccineWhodrugAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-WHODRUG-003 — the same `['whodrugVaccine', 'detail', id]` entry the detail page reads.
  const { data } = vaccineWhodrugResource.useOne(vaccineWhodrugId ?? '');

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
