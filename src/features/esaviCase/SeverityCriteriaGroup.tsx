import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  SERIOUS_CRITERION_FIELDS as CRITERION_FIELDS,
  type ClassificationFormValues,
  type SeverityCriterionField as CriterionField,
} from '@/features/classification/schemas';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';

const CRITERION_LABEL_KEYS: Record<CriterionField, string> = {
  causedDeath: 'classification.criteria.causedDeath',
  causedDisability: 'classification.criteria.causedDisability',
  causedCongenitalAnomaly: 'classification.criteria.causedCongenitalAnomaly',
  causedFetalDeath: 'classification.criteria.causedFetalDeath',
  causedLifeThreatening: 'classification.criteria.causedLifeThreatening',
  causedHospitalization: 'classification.criteria.causedHospitalization',
  causedAbortion: 'classification.criteria.causedAbortion',
  causedOtherCondition: 'classification.criteria.causedOtherCondition',
};

export interface SeverityCriteriaGroupProps {
  control: Control<ClassificationFormValues>;
  // `ClassificationStep` derives this from `formState.errors` (SPEC FE11 §3.5, la matriz de
  // coherencia marca el grupo, no un criterio suelto) — el componente sólo pinta el resultado.
  hasGroupError: boolean;
}

// Los ocho criterios de gravedad (SPEC FE11 §2, §3.1), extraído para no inflar
// `ClassificationStep.tsx`. Cada criterio es un `RadioGroup` de dos vías — nunca una tercera
// opción "sin marcar" — porque Radix no tiene un control nativo de tres estados y un `RadioGroup`
// con sólo dos ítems ya reproduce la regla exacta: null hasta que se toca, sin forma de volver
// atrás ni con teclado ni con clic (SPEC FE11 §6).
export function SeverityCriteriaGroup({ control, hasGroupError }: SeverityCriteriaGroupProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {CRITERION_FIELDS.map((fieldName) => {
        const label = t(CRITERION_LABEL_KEYS[fieldName]);
        return (
          <Controller
            key={fieldName}
            control={control}
            name={fieldName}
            render={({ field }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <RadioGroup
                  aria-label={label}
                  value={field.value === true ? 'true' : field.value === false ? 'false' : undefined}
                  onValueChange={(next) => field.onChange(next === 'true')}
                  className="flex w-auto gap-4"
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <RadioGroupItem value="true" />
                    {t('classification.gate.yes')}
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <RadioGroupItem value="false" />
                    {t('classification.gate.no')}
                  </label>
                </RadioGroup>
              </div>
            )}
          />
        );
      })}
      {hasGroupError && (
        <p role="alert" className="text-sm text-destructive">
          {t('classification.criteria.atLeastOneRequired')}
        </p>
      )}
    </div>
  );
}
