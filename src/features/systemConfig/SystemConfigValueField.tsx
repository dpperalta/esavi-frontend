import { useEffect, useRef } from 'react';
import type { SystemConfigValueType } from '@/contracts/systemConfig';
import { NumberField } from '@/shared/components/NumberField';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

export interface SystemConfigValueFieldProps {
  valueType: SystemConfigValueType;
  value: unknown;
  onChange: (value: unknown) => void;
  // No default, same reasoning as `<TimeField>`/`<NumberField>` (ARCHITECTURE.md §4.3).
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
}

function emptyValueForType(valueType: SystemConfigValueType): unknown {
  switch (valueType) {
    case 'string':
      return '';
    case 'number':
      return null;
    case 'boolean':
      return false;
    case 'json':
      return '{}';
    case 'array':
      return '[]';
  }
}

// SPEC FE19 §3.5 — the primitive that conmutes the editor by `valueType`. `json` and `array` keep
// the raw text in the form; `JSON.parse` only happens at submit, inside the schema's
// `.superRefine()` (`validateValueAgainstType`, `schemas.ts`) — never here.
export function SystemConfigValueField({
  valueType,
  value,
  onChange,
  ariaLabel,
  id,
  disabled,
}: SystemConfigValueFieldProps) {
  const previousValueTypeRef = useRef(valueType);

  // Changing `valueType` resets `value` to the empty shape of the new type (SPEC FE19 §3.5): a
  // leftover JSON string surviving a switch to `number`, or vice versa, would fail
  // `validateValueAgainstType` in a way the user never chose.
  useEffect(() => {
    if (previousValueTypeRef.current !== valueType) {
      previousValueTypeRef.current = valueType;
      onChange(emptyValueForType(valueType));
    }
  }, [valueType, onChange]);

  if (valueType === 'boolean') {
    return (
      <Switch
        id={id}
        checked={value === true}
        onCheckedChange={onChange}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    );
  }

  if (valueType === 'number') {
    return (
      <NumberField
        id={id}
        value={typeof value === 'number' ? value : null}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    );
  }

  if (valueType === 'json' || valueType === 'array') {
    return (
      <Textarea
        id={id}
        className="min-h-32 font-mono"
        aria-label={ariaLabel}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
