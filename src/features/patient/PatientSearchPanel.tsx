import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';

export type PatientSearchMode = 'identifier' | 'name';

export interface PatientSearchPanelProps {
  mode: PatientSearchMode;
  onModeChange: (mode: PatientSearchMode) => void;
  term: string;
  onTermChange: (term: string) => void;
  disabled?: boolean;
}

// The single field with a mode selector of SPEC FE10 §3.5 — descartado tanto el campo que adivina
// (un `PROV-2026...` se parece a un nombre y a un documento por igual) como los dos campos
// visibles a la vez (§6). A controlled, dumb component: `PatientStep` owns `mode`/`term` (§3.4,
// excepción declarada — un dato personal no va en `searchParams`) and decides which of the two
// search hooks to run against the debounced term.
export function PatientSearchPanel({
  mode,
  onModeChange,
  term,
  onTermChange,
  disabled,
}: PatientSearchPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={mode}
        onValueChange={(next) => onModeChange(next as PatientSearchMode)}
        aria-label={t('patient.search.modeLabel')}
        className="grid grid-cols-2 gap-1 rounded-lg border p-1"
      >
        <label className="relative flex cursor-pointer items-center justify-center">
          <RadioGroupItem value="identifier" className="peer sr-only" disabled={disabled} />
          <span className="flex w-full items-center justify-center rounded-md py-1 text-sm text-muted-foreground peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground">
            {t('patient.search.mode.identifier')}
          </span>
        </label>
        <label className="relative flex cursor-pointer items-center justify-center">
          <RadioGroupItem value="name" className="peer sr-only" disabled={disabled} />
          <span className="flex w-full items-center justify-center rounded-md py-1 text-sm text-muted-foreground peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground">
            {t('patient.search.mode.name')}
          </span>
        </label>
      </RadioGroup>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="patientSearchPanel-term">{t('patient.search.termLabel')}</Label>
        <Input
          id="patientSearchPanel-term"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          placeholder={t(
            mode === 'identifier' ? 'patient.search.identifierPlaceholder' : 'patient.search.namePlaceholder',
          )}
          disabled={disabled}
        />
        {/* The hint names the rule before the user searches, not after (SPEC FE10 §5: "la ayuda
            del campo lo dice antes de buscar, no después"). */}
        <p className="text-sm text-muted-foreground">
          {t(mode === 'identifier' ? 'patient.search.identifierHint' : 'patient.search.nameHint')}
        </p>
      </div>
    </div>
  );
}
