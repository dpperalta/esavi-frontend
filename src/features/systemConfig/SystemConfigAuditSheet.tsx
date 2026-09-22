import { useTranslation } from 'react-i18next';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { systemConfigResource } from './api';

export interface SystemConfigAuditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemConfigId: string | null;
}

// SPEC FE19 §4 paso 8 — la auditoría genérica de `appDetails` (operaciones), distinta del
// historial de valores del paso 7 (`ESAVI-SYSCONF-007`). Toda pantalla de detalle lleva
// `<AuditTrail>` (CONVENTIONS.md §10.4); aquí sólo SUPERADMIN llega, igual que al resto de la
// pantalla.
export function SystemConfigAuditSheet({
  open,
  onOpenChange,
  systemConfigId,
}: SystemConfigAuditSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // ESAVI-SYSCONF-003 — la misma fila cacheada que el diálogo de formulario puede tener para
  // este id.
  const { data } = systemConfigResource.useOne(systemConfigId ?? '');

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
