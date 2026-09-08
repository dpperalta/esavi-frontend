import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/components/ui/input';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  // No default, same reasoning as `<DateField>`/`<TimeField>` (ARCHITECTURE.md §4.3).
  ariaLabel: string;
  // The ceiling comes from the column's type, never from a `CHECK` (ARCHITECTURE.md §4.3): nine
  // counters of the schema are `smallint` (32767) and need `max`; `doseNumber` (SPEC FE12c §3.5)
  // has none, so it's simply omitted — an unbounded 500 from Postgres is what skipping this
  // primitive costs.
  min?: number;
  max?: number;
  id?: string;
  disabled?: boolean;
}

const INTEGER_PATTERN = /^-?\d+$/;

// The primitive of ARCHITECTURE.md §4.3. Plain text with a digits-only mask instead of
// `<input type="number">`, same reasoning as `<TimeField>`: the native control silently clamps
// or discards an out-of-range value before this component ever sees it, which is exactly the
// input a client-side ceiling has to reject with its own message.
export function NumberField({ value, onChange, ariaLabel, min, max, id, disabled }: NumberFieldProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value === null ? '' : String(value));
    setInvalid(false);
  }, [value]);

  function commit(raw: string) {
    setDraft(raw);
    const trimmed = raw.trim();

    if (trimmed === '') {
      setInvalid(false);
      onChange(null);
      return;
    }

    if (!INTEGER_PATTERN.test(trimmed)) {
      setInvalid(true);
      return;
    }

    const parsed = Number(trimmed);
    if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onChange(parsed);
  }

  return (
    <div>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        disabled={disabled}
        value={draft}
        onChange={(event) => commit(event.target.value)}
      />
      {invalid && (
        <p id={errorId} className="text-sm text-destructive">
          {t('common.numberField.invalid')}
        </p>
      )}
    </div>
  );
}
