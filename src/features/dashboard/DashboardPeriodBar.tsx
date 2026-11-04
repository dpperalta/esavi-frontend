import { zodResolver } from '@hookform/resolvers/zod';
import { parseISO } from 'date-fns';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { DashboardPeriod } from '@/contracts/dashboard';
import { DateField } from '@/shared/components/DateField';
import { Button } from '@/shared/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/shared/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { cn } from '@/shared/lib/utils';
import { DashboardGeoFilter } from './DashboardGeoFilter';
import type { DashboardRange } from './dashboardPeriod';
import { DASHBOARD_MAX_PERIOD_DAYS, DASHBOARD_RANGES, dashboardPeriodSchema } from './schemas';
import type { DashboardPeriodFormValues } from './schemas';
import { todayIsoDate, useDashboardPeriod } from './useDashboardPeriod';

type PeriodOption = DashboardRange | 'custom';

const PERIOD_OPTIONS: readonly PeriodOption[] = [...DASHBOARD_RANGES, 'custom'];

// What the backend applies with no params (DASHBOARD_DEFAULT_PERIOD_DAYS): highlighted so the
// bar reads like what is on screen, without writing it into the URL.
const DEFAULT_OPTION: PeriodOption = '30d';

interface DashboardPeriodBarProps {
  // `data.period` of the numbers currently on screen — never what the client computed
  // (SPEC FE35 §3.4). With keepPreviousData it stays on the old range until the new one lands.
  displayedPeriod?: DashboardPeriod;
  // The section saw a 400 from the backend and dropped the period (SPEC FE35 §3.5).
  serverRejected?: boolean;
}

export function DashboardPeriodBar({ displayedPeriod, serverRejected = false }: DashboardPeriodBarProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const labelId = useId();
  const [, setSearchParams] = useSearchParams();
  const { params, periodDiscarded, geoLocationIdDiscarded } = useDashboardPeriod();
  // Only whether the custom fields are unfolded before anything is applied: the period itself is
  // in the URL, and once a custom one is applied the URL alone keeps them open.
  const [customOpen, setCustomOpen] = useState(false);

  const selected: PeriodOption =
    customOpen || params.mode === 'custom'
      ? 'custom'
      : params.mode === 'range' && params.range
        ? params.range
        : DEFAULT_OPTION;

  // Each write leaves a single form in the URL (SPEC FE35 §7) and touches only the period keys,
  // on a copy of the current params, so geoLocationId and anything else survive.
  function applyRange(range: DashboardRange) {
    setCustomOpen(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('range', range);
      next.delete('from');
      next.delete('to');
      return next;
    });
  }

  function applyCustom({ from, to }: DashboardPeriodFormValues) {
    if (!from || !to) return;
    setCustomOpen(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('from', from);
      next.set('to', to);
      next.delete('range');
      return next;
    });
  }

  function choose(option: PeriodOption) {
    if (option === 'custom') setCustomOpen(true);
    else applyRange(option);
  }

  const showInvalidNotice = periodDiscarded || geoLocationIdDiscarded || serverRejected;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span id={labelId} className="text-sm font-medium text-foreground">
            {t('dashboard.period.label')}
          </span>
          {isMobile ? (
            <Select value={selected} onValueChange={(value) => choose(value as PeriodOption)}>
              <SelectTrigger aria-labelledby={labelId} className="w-full" clearable={false}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {optionLabel(t, option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <PeriodRadioGroup labelId={labelId} selected={selected} onChoose={choose} />
          )}
        </div>
        <DashboardGeoFilter value={params.geoLocationId} />
      </div>

      {selected === 'custom' && (
        <CustomPeriodForm
          // Remounting on a new URL period reloads its dates instead of mirroring them in state.
          key={`${params.from ?? ''}|${params.to ?? ''}`}
          initialFrom={params.from}
          initialTo={params.to}
          onApply={applyCustom}
        />
      )}

      {displayedPeriod && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('dashboard.period.current', {
            from: formatIsoDate(displayedPeriod.from, i18n.language),
            to: formatIsoDate(displayedPeriod.to, i18n.language),
          })}
        </p>
      )}

      {showInvalidNotice && (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm text-foreground">
          {t('dashboard.period.invalidLink')}
        </p>
      )}
    </div>
  );
}

function optionLabel(t: ReturnType<typeof useTranslation>['t'], option: PeriodOption): string {
  return option === 'custom' ? t('dashboard.period.custom') : t(`dashboard.period.range.${option}`);
}

interface PeriodRadioGroupProps {
  labelId: string;
  selected: PeriodOption;
  onChoose: (option: PeriodOption) => void;
}

// WAI-ARIA radio group with a roving tabindex: Tab enters on the checked option, arrows move and
// select, Home/End jump to the ends.
function PeriodRadioGroup({ labelId, selected, onChoose }: PeriodRadioGroupProps) {
  const { t } = useTranslation();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = PERIOD_OPTIONS.indexOf(selected);
    const last = PERIOD_OPTIONS.length - 1;
    const target = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowDown: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      ArrowUp: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChoose(PERIOD_OPTIONS[target]);
    buttons.current[target]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      className="inline-flex flex-wrap gap-1 rounded-lg border p-1"
    >
      {PERIOD_OPTIONS.map((option, index) => {
        const checked = option === selected;
        return (
          <Button
            key={option}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            variant={checked ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('pointer-coarse:h-11', checked && 'font-semibold')}
            onClick={() => onChoose(option)}
          >
            {optionLabel(t, option)}
          </Button>
        );
      })}
    </div>
  );
}

interface CustomPeriodFormProps {
  initialFrom?: string;
  initialTo?: string;
  onApply: (values: DashboardPeriodFormValues) => void;
}

function CustomPeriodForm({ initialFrom, initialTo, onApply }: CustomPeriodFormProps) {
  const { t } = useTranslation();
  // The same schema that parses the URL (SPEC FE35 §3.5), so the form blocks exactly what the
  // URL parser would discard.
  const form = useForm<DashboardPeriodFormValues>({
    resolver: zodResolver(dashboardPeriodSchema(todayIsoDate())),
    defaultValues: { from: initialFrom, to: initialTo },
  });

  // Custom issues carry an i18n key (schemas.ts); native ones arrive already translated by the
  // global zod error map.
  function errorText(message: string | undefined): string | undefined {
    if (!message) return undefined;
    return message.startsWith('dashboard.')
      ? t(message, { maxDays: DASHBOARD_MAX_PERIOD_DAYS })
      : message;
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onApply)}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start"
      >
        {(['from', 'to'] as const).map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field, fieldState }) => {
              const message = errorText(fieldState.error?.message);
              return (
                <FormItem className="sm:w-56">
                  <FormLabel>{t(`dashboard.period.${name}`)}</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                      ariaLabel={t(`dashboard.period.${name}`)}
                      allowFuture={false}
                    />
                  </FormControl>
                  {message && (
                    <p role="alert" className="text-sm text-destructive">
                      {message}
                    </p>
                  )}
                </FormItem>
              );
            }}
          />
        ))}
        <Button type="submit" className="pointer-coarse:h-11 sm:mt-[1.375rem]">
          {t('dashboard.period.apply')}
        </Button>
      </form>
    </Form>
  );
}

// Calendar dates, not instants: parseISO reads `YYYY-MM-DD` as local midnight, so the day shown
// is the day the backend counted in any timezone.
function formatIsoDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISO(isoDate));
}
