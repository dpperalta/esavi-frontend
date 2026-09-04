import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Input } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';

export interface DateFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  // Accessible name of this instance — every one of the nine date filters and every date field
  // of the wizard needs its own (ARCHITECTURE.md §4.3, SPEC FE09 §3.7). No default: a shared
  // placeholder would make every instance sound like every other one to a screen reader.
  ariaLabel: string;
  // The temporal rule, by parameter (ARCHITECTURE.md §4.3). The wizard instantiates `false`
  // (esaviCase.validator.ts, `isNotFutureDate`); list filters instantiate `true` — they don't
  // inherit the rule because an open-ended "from March on" is a legitimate query (F48 §3.7).
  allowFuture: boolean;
  id?: string;
  disabled?: boolean;
}

function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// Same comparison the backend validator runs (esaviCase.validator.ts: `toIsoDay(value) <=
// todayIsoDate()`) — lexicographic over `YYYY-MM-DD`, never a constructed `Date`.
function isFutureIsoDate(isoDate: string): boolean {
  return isoDate > todayIsoDate();
}

// The primitive of ARCHITECTURE.md §4.3, adelantada desde FE10 por SPEC FE09 §1E. Keyboard entry
// goes through `<input type="date">` — typing `2026-03-01` fixes the value without ever opening
// the popover; the calendar is for the mouse only, never the other way around (§3.7).
export function DateField({ value, onChange, ariaLabel, allowFuture, id, disabled }: DateFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // A local draft absorbs a rejected keystroke (a typed future date when `allowFuture` is
  // false): reverting straight to the `value` prop without this buffer would leave the native
  // input's own DOM value out of sync with what React thinks it painted.
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  function commit(nextValue: string | null) {
    if (nextValue && !allowFuture && isFutureIsoDate(nextValue)) {
      setDraft(value ?? '');
      return;
    }
    setDraft(nextValue ?? '');
    onChange(nextValue);
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="date"
        aria-label={ariaLabel}
        disabled={disabled}
        value={draft}
        max={allowFuture ? undefined : todayIsoDate()}
        onChange={(event) => commit(event.target.value || null)}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={t('common.dateField.openCalendar', { field: ariaLabel })}
          >
            <CalendarIcon aria-hidden="true" className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ? new Date(`${value}T00:00:00`) : undefined}
            disabled={allowFuture ? undefined : { after: new Date() }}
            onSelect={(date) => {
              commit(date ? format(date, 'yyyy-MM-dd') : null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
