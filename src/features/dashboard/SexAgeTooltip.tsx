import { useTranslation } from 'react-i18next';
import type { TooltipContentProps } from 'recharts';
import type { SexAgeRow } from './sexAgeRows';

const SEXES = [
  { code: 'FEMALE', field: 'female', color: 'var(--chart-1)' },
  { code: 'MALE', field: 'male', color: 'var(--chart-2)' },
  { code: 'UNKNOWN', field: 'unknown', color: null },
  { code: 'NONE', field: 'none', color: null },
] as const;

// Tooltip of one pyramid band (SPEC FE36b §3.6): the four sexes, read from the row and not from
// the bar, whose female value is negated only to draw it on the left.
export function SexAgeTooltip({ active, payload }: TooltipContentProps) {
  const { t, i18n } = useTranslation();
  const row = payload?.[0]?.payload as SexAgeRow | undefined;
  if (!active || !row) return null;
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium text-foreground">{t(`dashboard.sexAge.band.${row.band}`)}</p>
      <dl className="grid gap-1">
        {SEXES.map(({ code, field, color }) => (
          <div key={code} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color ?? 'transparent' }}
            />
            <dt className="flex-1 text-muted-foreground">{t(`dashboard.sexAge.sex.${code}`)}</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {countFormat.format(row[field])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
