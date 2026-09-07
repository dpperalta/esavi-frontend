import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/components/ui/input';

export interface TimeFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  // No default, same reasoning as `<DateField>`'s `ariaLabel` (ARCHITECTURE.md §4.3): every
  // instance — `startTime` here, `vaccinationTime` and `reconstitutionTime` in FE12c — needs its
  // own name for a screen reader.
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Postgres `time` reads back as 'HH:MM:SS' (notificationEvent.service.ts, `normalizeTime`). This
// field only ever asks for hours and minutes, so the seconds are dropped on the way in — the
// value is not lost, it is simply never round-tripped through the seconds it never collected.
function toDisplayValue(value: string | null): string {
  if (!value) return '';
  return value.length > 5 ? value.slice(0, 5) : value;
}

// Plain text with a digits-only mask, not `<input type="time">`: the native picker sanitizes an
// out-of-range value to an empty string before this component ever sees it, which is exactly the
// input this field has to reject with its own message instead of silently swallowing. Typing
// keeps only the digits and re-inserts the `:` after the first two, so `2500` and `25:00` mask to
// the same string.
function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// The primitive of SPEC FE12b §2: `HH:MM` without forcing the seconds a form never asked for.
export function TimeField({ value, onChange, ariaLabel, id, disabled }: TimeFieldProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [draft, setDraft] = useState(toDisplayValue(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(toDisplayValue(value));
    setInvalid(false);
  }, [value]);

  function commit(raw: string) {
    const masked = maskTimeInput(raw);
    setDraft(masked);

    if (masked === '') {
      setInvalid(false);
      onChange(null);
      return;
    }

    // Still being typed — four digits or fewer is an incomplete time, not an invalid one.
    if (masked.length < 5) {
      setInvalid(false);
      return;
    }

    if (!TIME_PATTERN.test(masked)) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onChange(masked);
  }

  return (
    <div>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={5}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        disabled={disabled}
        placeholder={t('common.timeField.placeholder')}
        value={draft}
        onChange={(event) => commit(event.target.value)}
      />
      {invalid && (
        <p id={errorId} className="text-sm text-destructive">
          {t('common.timeField.invalid')}
        </p>
      )}
    </div>
  );
}
