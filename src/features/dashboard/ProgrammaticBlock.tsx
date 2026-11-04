import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { CategoryBarList } from './CategoryBarList';
import { programmaticRate } from './programmaticRate';

type Programmatic = DashboardDistributions['programmatic'];
type AdministrationIndicator = Exclude<keyof Programmatic['administrationErrors'], 'anyError'>;
type ColdChainIndicator = Exclude<keyof Programmatic['coldChainFailures'], 'anyFailure'>;

const ADMINISTRATION_INDICATORS: AdministrationIndicator[] = [
  'prescriptionError',
  'contaminatedVaccine',
  'abnormalVaccineConditions',
  'preparationError',
  'handlingError',
  'improperAdministration',
];
const COLD_CHAIN_INDICATORS: ColdChainIndicator[] = [
  'rangeDeviation',
  'procedureNotFollowed',
  'vaccineNotUsable',
  'diluentNotUsable',
  'partiallyReconstitutedVaccine',
  'otherObjectPresent',
];

interface FailureCardProps {
  title: string;
  summary: { label: string; count: number };
  indicators: { key: string; label: string; count: number }[];
  investigated: number;
  withoutRecord: number;
}

function FailureCard({
  title,
  summary,
  indicators,
  investigated,
  withoutRecord,
}: FailureCardProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const countFormat = new Intl.NumberFormat(i18n.language);
  const percentFormat = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 1,
  });
  const withRecord = investigated - withoutRecord;
  const summaryRate = programmaticRate(summary.count, investigated, withoutRecord);
  const countAndRate = (count: number, rate: number) =>
    `${countFormat.format(count)} · ${percentFormat.format(rate)}`;

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4"
    >
      <h4 id={titleId} className="text-sm font-medium text-foreground">
        {title}
      </h4>
      {investigated === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('dashboard.programmatic.noInvestigations')}
        </p>
      ) : summaryRate === null ? (
        <>
          <p className="text-sm text-muted-foreground">{t('dashboard.programmatic.noRecords')}</p>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.programmatic.withoutRecord', { count: withoutRecord })}
          </p>
        </>
      ) : (
        <>
          {/* «At least one» answers «were there failures?» before the detail (SPEC FE36b §6). */}
          <div className="flex flex-col gap-1 rounded-md bg-muted p-3">
            <span className="text-xs leading-tight text-muted-foreground">{summary.label}</span>
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {countAndRate(summary.count, summaryRate)}
            </span>
            {/* The denominator stays visible so a rate over 3 records is not read as representative
                (SPEC FE36b §7). */}
            <span className="text-xs text-muted-foreground">
              {t('dashboard.programmatic.denominator', { count: withRecord })}
            </span>
          </div>
          <CategoryBarList
            labelledBy={titleId}
            rows={indicators.map(({ key, label, count }) => {
              const rate = programmaticRate(count, investigated, withoutRecord) ?? 0;
              return { key, label, value: rate, display: countAndRate(count, rate) };
            })}
          />
          <p className="text-sm text-muted-foreground">
            {t('dashboard.programmatic.withoutRecord', { count: withoutRecord })}
          </p>
        </>
      )}
    </section>
  );
}

interface ProgrammaticBlockProps {
  data: Programmatic;
}

// Rates are over the investigations that have the group's record, never over investigatedCases:
// an investigation without the record was not evaluated (F67 §6, SPEC FE36b §3.5).
export function ProgrammaticBlock({ data }: ProgrammaticBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <h3 id={titleId} className="text-base font-medium text-foreground">
        {t('dashboard.programmatic.title')}
      </h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <FailureCard
          title={t('dashboard.programmatic.administration.title')}
          summary={{
            label: t('dashboard.programmatic.administration.anyError'),
            count: data.administrationErrors.anyError,
          }}
          indicators={ADMINISTRATION_INDICATORS.map((key) => ({
            key,
            label: t(`dashboard.programmatic.administration.${key}`),
            count: data.administrationErrors[key],
          }))}
          investigated={data.investigatedCases}
          withoutRecord={data.withoutAdministrationRecord}
        />
        <FailureCard
          title={t('dashboard.programmatic.coldChain.title')}
          summary={{
            label: t('dashboard.programmatic.coldChain.anyFailure'),
            count: data.coldChainFailures.anyFailure,
          }}
          indicators={COLD_CHAIN_INDICATORS.map((key) => ({
            key,
            label: t(`dashboard.programmatic.coldChain.${key}`),
            count: data.coldChainFailures[key],
          }))}
          investigated={data.investigatedCases}
          withoutRecord={data.withoutColdChainRecord}
        />
      </div>
    </section>
  );
}
