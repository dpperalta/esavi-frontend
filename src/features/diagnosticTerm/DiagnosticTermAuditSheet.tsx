import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { diagnosticTermResource } from './api';

interface DiagnosticTermAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnosticTermId: string | null;
}

// Same shape as DiluentAuditSheet: <AuditTrail> renders its own visible heading, so the Radix
// title is `sr-only`. Reached only with SUPERADMIN (CONVENTIONS.md §10.4), which is also the only
// role the `003` answers for an inactive row (SPEC FE25b §1.D).
export function DiagnosticTermAuditSheet({
  open,
  onOpenChange,
  diagnosticTermId,
}: DiagnosticTermAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-DIAGTERM-003 — the same `['diagnosticTerm', 'detail', id]` entry the form dialog reads.
  const { data } = diagnosticTermResource.useOne(diagnosticTermId ?? '');

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
