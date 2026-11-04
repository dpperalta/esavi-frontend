import { useId } from 'react';
import { ChartColumnIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { Button } from '@/shared/components/ui/button';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/shared/components/ui/chart';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { pyramidMax, pyramidTicks, sexAgeRows, type SexAgeRow } from './sexAgeRows';
import { SexAgeTable } from './SexAgeTable';
import { SexAgeTooltip } from './SexAgeTooltip';
import { useChartViewParam } from './useChartViewParam';

const SIDES = [
  { code: 'FEMALE', dataKey: 'femaleBar', color: 'var(--chart-1)' },
  { code: 'MALE', dataKey: 'male', color: 'var(--chart-2)' },
] as const;

// 9 bands of 28 px plus the value axis (SPEC FE36b §3.7).
const ROW_HEIGHT = 28;
const X_AXIS_HEIGHT = 24;
const Y_AXIS_WIDTH = 64;

type PyramidRow = SexAgeRow & { femaleBar: number };

function SexAgePyramid({ rows }: { rows: SexAgeRow[] }) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const countFormat = new Intl.NumberFormat(i18n.language);
  // Female is negated only inside the chart data, to draw it on the left; axis and tooltip show
  // absolute values (SPEC FE36b §7).
  const data: PyramidRow[] = rows.map((row) => ({ ...row, femaleBar: -row.female }));
  const max = pyramidMax(rows);
  const config = Object.fromEntries(
    SIDES.map(({ code, dataKey, color }) => [
      dataKey,
      { label: t(`dashboard.sexAge.sex.${code}`), color },
    ]),
  ) satisfies ChartConfig;
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div
      role="img"
      aria-label={t('dashboard.sexAge.summary', {
        count: total,
        total: countFormat.format(total),
      })}
      className="flex flex-col gap-2"
    >
      {/* The legend names each side in text, so color is not the only channel (SPEC FE36b §3.7). */}
      <div
        className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        style={{ paddingLeft: Y_AXIS_WIDTH }}
      >
        {SIDES.map(({ code, color }) => (
          <span key={code} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color }}
            />
            {t(`dashboard.sexAge.sex.${code}`)}
          </span>
        ))}
      </div>
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: rows.length * ROW_HEIGHT + X_AXIS_HEIGHT }}
      >
        {/* The table view is the keyboard and screen-reader path (SPEC FE36a §3.7). */}
        <BarChart
          data={data}
          layout="vertical"
          stackOffset="sign"
          accessibilityLayer={false}
          barCategoryGap={4}
          margin={{ top: 0, bottom: 0, left: 0, right: 8 }}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            domain={[-max, max]}
            ticks={pyramidTicks(max)}
            height={X_AXIS_HEIGHT}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => countFormat.format(Math.abs(value))}
          />
          <YAxis
            type="category"
            dataKey="band"
            width={Y_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tickFormatter={(band: string) => t(`dashboard.sexAge.band.${band}`)}
          />
          <ChartTooltip
            content={(props) => <SexAgeTooltip {...props} />}
            position={isMobile ? { y: 0 } : undefined}
          />
          {SIDES.map(({ dataKey }) => (
            <Bar key={dataKey} dataKey={dataKey} stackId="sex" fill={`var(--color-${dataKey})`} />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

interface SexAgeBlockProps {
  data: DashboardDistributions['sexAge'];
}

// Sex × age of ESAVI-DASH-009 (SPEC FE36b). DistributionsSection owns the request and its
// loading and error states; this block only draws what it is given.
export function SexAgeBlock({ data }: SexAgeBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { isTable, toggle } = useChartViewParam('sexAgeView');
  const rows = sexAgeRows(data);
  const hasNoCases = rows.every((row) => row.total === 0);
  const unknownOrNone = rows.reduce((sum, row) => sum + row.unknownOrNone, 0);

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={titleId} className="text-base font-medium text-foreground">
          {t('dashboard.sexAge.title')}
        </h3>
        <Button variant="outline" aria-pressed={isTable} onClick={toggle}>
          {isTable ? <ChartColumnIcon aria-hidden="true" /> : <TableIcon aria-hidden="true" />}
          {t(isTable ? 'dashboard.charts.viewChart' : 'dashboard.charts.viewTable')}
        </Button>
      </div>

      {hasNoCases && (
        <p className="text-sm text-muted-foreground">{t('dashboard.indicators.noCasesInPeriod')}</p>
      )}
      {isTable ? <SexAgeTable rows={rows} /> : <SexAgePyramid rows={rows} />}

      {/* UNKNOWN and NONE do not fit a two-sided pyramid; hiding them would leave it short of the
          total, so they get their own line (SPEC FE36b §6). */}
      {unknownOrNone > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('dashboard.sexAge.unknownOrNone', { count: unknownOrNone })}
        </p>
      )}
    </section>
  );
}
