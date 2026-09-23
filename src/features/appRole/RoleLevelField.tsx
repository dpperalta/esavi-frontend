import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField } from '@/shared/components/NumberField';
import { Label } from '@/shared/components/ui/label';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useOwnRoleLevel } from '@/shared/hooks/useOwnRoleLevel';

export interface RoleLevelFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

// The four levels the seed ships, as `{ 10: 'ANALYTICS', … }`. Their codes are not translated:
// they are the literal values of appRole.code that roleValidation.middleware.ts compares.
const KNOWN_LEVEL_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ROLE_LEVELS).map(([name, level]) => [level, name]),
);

// A number with a ceiling, not a select of the four known levels: the backend's own example is
// 60 (SPEC F03), and a closed list would make impossible the very case the column exists for.
// The cap is read here rather than received as a prop so the requester's level stays in the one
// layer that owns it — the session query (SPEC FE21 §3.4).
export function RoleLevelField({ value, onChange, disabled }: RoleLevelFieldProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const maxLevel = useOwnRoleLevel();
  const label = t('appRole.columns.level');
  const knownName = value === null ? undefined : KNOWN_LEVEL_NAMES[value];

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-center gap-2">
        <NumberField
          id={fieldId}
          value={value}
          onChange={onChange}
          ariaLabel={label}
          min={0}
          max={maxLevel}
          disabled={disabled}
        />
        {/* Never colour-coded (SPEC FE21 §3.7): a coloured badge without text says nothing to
            whoever cannot tell those colours apart. */}
        {knownName && <span className="text-sm text-muted-foreground">· {knownName}</span>}
      </div>
      <p className="text-sm text-muted-foreground">{t('appRole.form.levelHint')}</p>
      <p className="text-sm text-muted-foreground">
        {t('appRole.form.levelMax', { level: maxLevel })}
      </p>
    </div>
  );
}
