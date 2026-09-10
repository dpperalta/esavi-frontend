import { useTranslation } from 'react-i18next';
import type { AnswerOption } from '@/contracts/common';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

export interface AnswerOptionFieldProps {
  value: AnswerOption | null;
  onChange: (value: AnswerOption | null) => void;
  ariaLabel: string;
  // `unknown` (YES/NO/UNKNOWN) covers every field of this spec's forms; `full` adds the two
  // process-only values (NOT_APPLICABLE/NO_ANSWER) for a screen that means to offer them
  // (SPEC FE12a §2). Neither variant restricts what the field can *read* — see §7.1 below.
  variant?: 'unknown' | 'full';
  disabled?: boolean;
  // The id of the text explaining why the field is disabled. A greyed-out control with no
  // stated reason is indistinguishable from a failure, and `disabled` alone says nothing to a
  // screen reader (SPEC FE12e §3.7).
  ariaDescribedBy?: string;
}

const UNKNOWN_OPTIONS: AnswerOption[] = ['YES', 'NO', 'UNKNOWN'];
const FULL_OPTIONS: AnswerOption[] = ['YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE', 'NO_ANSWER'];

const LABEL_KEYS: Record<AnswerOption, string> = {
  YES: 'common.answerOption.yes',
  NO: 'common.answerOption.no',
  UNKNOWN: 'common.answerOption.unknown',
  NOT_APPLICABLE: 'common.answerOption.notApplicable',
  NO_ANSWER: 'common.answerOption.noAnswer',
};

// The `<Select>` of ARCHITECTURE.md §4.3 for the five-value `answerOption` ENUM shared by seven
// tables of the schema (SPEC FE12a §3.3). §7.1's rule: a value the current variant does not
// offer — most commonly `NO_ANSWER` under `unknown`, loaded from a row another client wrote —
// still has to render, never fall back to blank. It is mounted as a hidden extra `<SelectItem>`
// so Radix still portals its label into the closed trigger, but it never appears in the open
// menu and the field never silently rewrites it to something the user didn't choose.
export function AnswerOptionField({
  value,
  onChange,
  ariaLabel,
  variant = 'unknown',
  disabled,
  ariaDescribedBy,
}: AnswerOptionFieldProps) {
  const { t } = useTranslation();
  const offeredOptions = variant === 'full' ? FULL_OPTIONS : UNKNOWN_OPTIONS;
  const unofferedValue = value && !offeredOptions.includes(value) ? value : null;

  return (
    <Select
      value={value ?? ''}
      onValueChange={(next) => onChange((next || null) as AnswerOption | null)}
      disabled={disabled}
    >
      <SelectTrigger
        className="w-full"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onClear={() => onChange(null)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {offeredOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {t(LABEL_KEYS[option])}
          </SelectItem>
        ))}
        {unofferedValue && (
          <SelectItem
            key={unofferedValue}
            value={unofferedValue}
            className="hidden"
            aria-hidden="true"
          >
            {t(LABEL_KEYS[unofferedValue])}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
