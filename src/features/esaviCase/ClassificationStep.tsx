import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';

export interface ClassificationAgeFieldProps {
  // Ambas en `false` hasta que las dos queries de las que depende el modo (`esaviCase`, `patient`)
  // resuelven — nunca se calcula aquí adentro, para no arriesgar una segunda implementación de la
  // misma regla (SPEC FE11 §7, riesgo del parpadeo).
  readyToResolve: boolean;
  canCalculate: boolean;
  resolvedAge: number | null;
  resolvedAgeUnitName: string | null;
  age: number | null;
  onAgeChange: (value: number | null) => void;
  ageUnitItemId: string | null;
  onAgeUnitItemIdChange: (value: string | null) => void;
  disabled?: boolean;
}

// El campo edad (SPEC FE11 §3.5, decisión §6): texto de sólo lectura con el valor resuelto por el
// backend cuando `patient.birthDate` y `esaviCase.eventDate` existen los dos; `<Input
// type="number">` + `<CatalogSelect typeCode="ageUnit" emit="id">` en caso contrario. El modo lo
// decide quien monta este componente (`readyToResolve`/`canCalculate`) a partir de dos queries ya
// cacheadas — nunca un `useState` ni un cálculo propio aquí.
export function ClassificationAgeField({
  readyToResolve,
  canCalculate,
  resolvedAge,
  resolvedAgeUnitName,
  age,
  onAgeChange,
  ageUnitItemId,
  onAgeUnitItemIdChange,
  disabled,
}: ClassificationAgeFieldProps) {
  const { t } = useTranslation();
  const noteId = useId();

  // Mientras las dos queries no resolvieron, el skeleton — nunca el modo editable como valor por
  // defecto (SPEC FE11 §3.6, §7): mostrar `<Input>` primero y ocultarlo después es peor que
  // esperar.
  if (!readyToResolve) {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-xs" />
      </div>
    );
  }

  if (canCalculate) {
    return (
      <div className="flex flex-col gap-1.5">
        <p aria-describedby={noteId} className="text-sm text-foreground">
          {resolvedAge !== null ? `${resolvedAge} ${resolvedAgeUnitName ?? ''}`.trim() : '—'}
        </p>
        {/* Asociado con `aria-describedby`, no sólo colocado al lado (SPEC FE11 §3.7). */}
        <p id={noteId} className="text-sm text-muted-foreground">
          {t('classification.age.calculatedNote')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('classification.age.label')}</span>
        <Input
          type="number"
          min={0}
          max={32767}
          value={age ?? ''}
          onChange={(event) =>
            onAgeChange(event.target.value === '' ? null : Number(event.target.value))
          }
          disabled={disabled}
          aria-label={t('classification.age.label')}
          className="w-full max-w-32"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('classification.age.unitLabel')}
        </span>
        <CatalogSelect
          typeCode="ageUnit"
          emit="id"
          value={ageUnitItemId}
          onChange={onAgeUnitItemIdChange}
          ariaLabel={t('classification.age.unitLabel')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
