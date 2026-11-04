import { useId } from 'react';
import { ChartColumnIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/shared/components/ui/chart';
import { cn } from '@/shared/lib/utils';
import { useChartViewParam } from './useChartViewParam';
import { VaccinesTable } from './VaccinesTable';

type Vaccines = DashboardDistributions['vaccines'];

// Same tokens as the epidemic curve, so serious / non-serious read the same in both charts
// (SPEC FE36b §6).
const SERIES = ['serious', 'nonSerious'] as const;
const SERIES_COLOR = { serious: 'var(--chart-1)', nonSerious: 'var(--chart-2)' } as const;

// 32 px per vaccine (SPEC FE36b §3.7). The HTML label column and the chart bands share it, which
// is what keeps each label on its bar.
const ROW_HEIGHT = 32;
// Room on the right of the longest bar for its total.
const VALUE_LABEL_SPACE = 40;

interface VaccineChartRow {
  key: string;
  name: string;
  unnamed: boolean;
  // «Sin nombre» and «Otras vacunas» are interface text; every other name is a product name as
  // recorded, which a browser translator must leave alone.
  isInterfaceText: boolean;
  coded: boolean;
  cases: number;
  serious: number;
  nonSerious: number;
}

function VaccineTooltip({ active, payload }: TooltipContentProps) {
  const { t, i18n } = useTranslation();
  const row = payload?.[0]?.payload as VaccineChartRow | undefined;
  if (!active || !row) return null;
  const countFormat = new Intl.NumberFormat(i18n.language);

  return (
    <div className="grid max-w-72 min-w-40 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div>
        <p
          translate={row.isInterfaceText ? undefined : 'no'}
          className={cn('font-medium text-foreground', (row.unnamed || !row.coded) && 'italic')}
        >
          {row.name}
        </p>
        {!row.coded && (
          <p className="text-muted-foreground">{t('dashboard.vaccines.uncodedHint')}</p>
        )}
      </div>
      <dl className="grid gap-1">
        <div className="flex items-center gap-2">
          <dt className="flex-1 text-muted-foreground">{t('dashboard.vaccines.columns.cases')}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {countFormat.format(row.cases)}
          </dd>
        </div>
        {SERIES.map((series) => (
          <div key={series} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: SERIES_COLOR[series] }}
            />
            <dt className="flex-1 text-muted-foreground">
              {t(`dashboard.epiCurve.series.${series}`)}
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {countFormat.format(row[series])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function VaccineLabel({ row }: { row: VaccineChartRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-1" style={{ height: ROW_HEIGHT }}>
      {/* Truncated here on purpose: the full name lives in the tooltip and the table view. */}
      <span
        translate={row.isInterfaceText ? undefined : 'no'}
        className={cn(
          'min-w-0 truncate text-xs text-foreground',
          (row.unnamed || !row.coded) && 'italic',
        )}
      >
        {row.name}
      </span>
      {!row.coded && (
        <Badge variant="outline" className="h-4 px-1">
          {t('dashboard.vaccines.uncoded')}
        </Badge>
      )}
    </div>
  );
}

function VaccineBars({ rows, max }: { rows: VaccineChartRow[]; max: number }) {
  const { t, i18n } = useTranslation();
  const countFormat = new Intl.NumberFormat(i18n.language);
  const config = Object.fromEntries(
    SERIES.map((series) => [
      series,
      { label: t(`dashboard.epiCurve.series.${series}`), color: SERIES_COLOR[series] },
    ]),
  ) satisfies ChartConfig;

  return (
    <div className="flex gap-2">
      {/* 96 px below md, 160 px from md (SPEC FE36b §3.7). HTML rather than an SVG tick, so the
          name gets a real ellipsis and the free-text badge. */}
      <div className="flex w-24 shrink-0 flex-col md:w-40">
        {rows.map((row) => (
          <VaccineLabel key={row.key} row={row} />
        ))}
      </div>
      <ChartContainer
        config={config}
        className="aspect-auto min-w-0 flex-1"
        style={{ height: rows.length * ROW_HEIGHT }}
      >
        {/* The table view is the keyboard and screen-reader path (SPEC FE36a §3.7). */}
        <BarChart
          data={rows}
          layout="vertical"
          accessibilityLayer={false}
          barCategoryGap={8}
          margin={{ top: 0, bottom: 0, left: 0, right: VALUE_LABEL_SPACE }}
        >
          {/* Both charts of the block share the domain, so «Otras vacunas» compares at scale. */}
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis type="category" dataKey="key" hide />
          <ChartTooltip content={(props) => <VaccineTooltip {...props} />} />
          <Bar dataKey="serious" stackId="cases" fill="var(--color-serious)" />
          <Bar dataKey="nonSerious" stackId="cases" fill="var(--color-nonSerious)">
            <LabelList
              dataKey="cases"
              position="right"
              className="fill-foreground tabular-nums"
              fontSize={12}
              formatter={(value) => countFormat.format(Number(value))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
      {SERIES.map((series) => (
        <li key={series} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: SERIES_COLOR[series] }}
          />
          {t(`dashboard.epiCurve.series.${series}`)}
        </li>
      ))}
    </ul>
  );
}

function VaccinesChart({ data }: { data: Vaccines }) {
  const { t, i18n } = useTranslation();
  const toRow = (row: Omit<VaccineChartRow, 'nonSerious'>): VaccineChartRow => ({
    ...row,
    nonSerious: row.cases - row.serious,
  });
  const rows = data.items.map((item) =>
    toRow({
      key: item.key,
      name: item.label ?? t('dashboard.vaccines.noLabel'),
      unnamed: item.label === null,
      isInterfaceText: item.label === null,
      coded: item.coded,
      cases: item.cases,
      serious: item.serious,
    }),
  );
  const othersRow =
    data.others.cases > 0
      ? toRow({
          key: 'others',
          name: t('dashboard.vaccines.others'),
          unnamed: false,
          isInterfaceText: true,
          coded: true,
          cases: data.others.cases,
          serious: data.others.serious,
        })
      : null;
  const max = Math.max(1, ...rows.map((row) => row.cases), othersRow?.cases ?? 0);
  const first = rows[0] ?? othersRow;
  const summary = first
    ? t('dashboard.vaccines.summary', {
        count: rows.length,
        label: first.name,
        cases: new Intl.NumberFormat(i18n.language).format(first.cases),
      })
    : '';

  return (
    <div role="img" aria-label={summary} className="flex flex-col gap-2">
      {rows.length > 0 && <VaccineBars rows={rows} max={max} />}
      {othersRow && (
        <div className={cn(rows.length > 0 && 'border-t pt-2')}>
          <VaccineBars rows={[othersRow]} max={max} />
        </div>
      )}
      <Legend />
    </div>
  );
}

interface VaccinesBlockProps {
  data: Vaccines;
}

// Suspected vaccines of ESAVI-DASH-009 (SPEC FE36b). DistributionsSection owns the request and
// its loading and error states; this block only draws what it is given.
export function VaccinesBlock({ data }: VaccinesBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { isTable, toggle } = useChartViewParam('vaccinesView');
  const isEmpty = data.items.length === 0 && data.others.cases === 0;

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={titleId} className="text-base font-medium text-foreground">
          {t('dashboard.vaccines.title')}
        </h3>
        {!isEmpty && (
          <Button variant="outline" aria-pressed={isTable} onClick={toggle}>
            {isTable ? <ChartColumnIcon aria-hidden="true" /> : <TableIcon aria-hidden="true" />}
            {t(isTable ? 'dashboard.charts.viewChart' : 'dashboard.charts.viewTable')}
          </Button>
        )}
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.vaccines.empty')}</p>
      ) : isTable ? (
        <VaccinesTable data={data} />
      ) : (
        <VaccinesChart data={data} />
      )}

      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <p>
          {t('dashboard.vaccines.withoutSuspected', { count: data.casesWithoutSuspectedVaccine })}
        </p>
        {/* Always shown, also without `others`: summing the bars overshoots the case total
            (SPEC FE36b §7). */}
        {!isEmpty && <p>{t('dashboard.vaccines.multiNote')}</p>}
      </div>
    </section>
  );
}
