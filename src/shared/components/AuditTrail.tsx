import { format } from 'date-fns';
import { enUS, es, nl } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import type { AppDetails } from '@/contracts/common';
import { Badge } from '@/shared/components/ui/badge';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

const DATE_FNS_LOCALES: Record<Language, typeof es> = { es, en: enUS, nl };

function formatAuditDate(value: Date | string, language: Language): string {
  return format(new Date(value), 'd MMM yyyy, HH:mm', { locale: DATE_FNS_LOCALES[language] });
}

export interface AuditTrailProps {
  // Every entity has `appDetails`, so every detail view carries an <AuditTrail> (CONVENTIONS.md
  // §10.4). `null` is a real state — not every row has been written since the field existed.
  appDetails: AppDetails[] | null;
}

// Reads `appDetails` from any row and paints it as a chronological list — newest first, since
// that's what "what changed recently" means for an audit trail.
export function AuditTrail({ appDetails }: AuditTrailProps) {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const entries = appDetails ?? [];
  const sorted = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium text-foreground">{t('common.audit.title')}</h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('common.audit.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {sorted.map((entry, index) => (
            <li key={index} className="flex flex-col gap-1 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <time
                  dateTime={new Date(entry.createdAt).toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  <span className="sr-only">{t('common.audit.columns.date')}: </span>
                  {formatAuditDate(entry.createdAt, language)}
                </time>
                <Badge variant="outline">
                  <span className="sr-only">{t('common.audit.columns.method')}: </span>
                  {entry.method}
                </Badge>
              </div>
              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                <span className="sr-only">{t('common.audit.columns.user')}: </span>
                {entry.user}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="sr-only">{t('common.audit.columns.detail')}: </span>
                {entry.detail}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
