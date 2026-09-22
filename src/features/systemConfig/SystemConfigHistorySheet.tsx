import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { enUS, es, nl } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/useMobile';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { useSystemConfigHistory } from './api';

const DATE_FNS_LOCALES: Record<Language, typeof es> = { es, en: enUS, nl };
const PAGE_SIZE = 20;

function formatHistoryDate(value: string, language: Language): string {
  return format(new Date(value), 'd MMM yyyy, HH:mm', { locale: DATE_FNS_LOCALES[language] });
}

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface SystemConfigHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemConfigId: string | null;
}

// SPEC FE19 §4 paso 7 — historial de valores (`ESAVI-SYSCONF-007`), distinto de `<AuditTrail>`
// (paso 8): éste registra cambios de *valor*, con su motivo y su autor, no operaciones.
export function SystemConfigHistorySheet({
  open,
  onOpenChange,
  systemConfigId,
}: SystemConfigHistorySheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const language = usePreferencesStore((state) => state.language);
  // Página propia del panel (SPEC FE19 §3.4, excepción declarada a que la paginación viva en
  // `searchParams`): es estado efímero de algo que se cierra, no una vista compartible.
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open, systemConfigId]);

  const history = useSystemConfigHistory(
    systemConfigId ?? '',
    { page, pageSize: PAGE_SIZE },
    open && !!systemConfigId,
  );
  const rows = history.data?.rows ?? [];
  const count = history.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('systemConfig.history.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {history.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!history.isLoading && history.isError && (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-destructive">
                {history.error instanceof EsaviApiError
                  ? getErrorMessage(history.error)
                  : t('common.errors.unexpected')}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void history.refetch()}>
                {t('common.table.retry')}
              </Button>
            </div>
          )}

          {!history.isLoading && !history.isError && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('systemConfig.history.empty')}</p>
          )}

          {!history.isLoading && !history.isError && rows.length > 0 && (
            <ol className="flex flex-col gap-3">
              {rows.map((row) => (
                <li key={row.systemConfigHistoryId} className="flex flex-col gap-1 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <time
                      dateTime={new Date(row.createdAt).toISOString()}
                      className="text-xs text-muted-foreground"
                    >
                      {formatHistoryDate(row.createdAt, language)}
                    </time>
                    <span className="text-xs font-medium text-foreground">
                      <span className="sr-only">{t('systemConfig.history.changedBy')}: </span>
                      {row.changedByUser?.displayName ?? t('systemConfig.history.unknownAuthor')}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">
                      {t('systemConfig.history.previousValue')}:{' '}
                    </span>
                    <span className="font-mono">{formatHistoryValue(row.previousValue)}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">
                      {t('systemConfig.history.newValue')}:{' '}
                    </span>
                    <span className="font-mono">{formatHistoryValue(row.newValue)}</span>
                  </p>
                  {row.changeReason && (
                    <p className="text-sm text-muted-foreground">{row.changeReason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {!history.isLoading && !history.isError && count > PAGE_SIZE && (
            <nav
              className="flex items-center justify-between gap-3"
              aria-label={t('common.table.pagination')}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                {t('common.table.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.table.pageStatus', { page, pages: totalPages, count })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('common.table.next')}
              </Button>
            </nav>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
