import { useTranslation } from 'react-i18next';
import { CatalogSelect } from '@/shared/components/CatalogSelect';

export interface ImportanceSelectProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  // The block that took this selector's position (SPEC FE14a §3.1, §3.5): `null` while the slot
  // stays its own. Elegir una posición que ya tiene otro bloque deja ESE OTRO selector en `null` y
  // pone su `releasedToBlock` a la letra del bloque que la reclamó — `FinalClassificationStep`
  // decides this, never the selector itself.
  releasedToBlock: 'A' | 'B' | 'C' | null;
  disabled?: boolean;
}

// Un `<CatalogSelect typeCode="finalClassificationImportance">` por bloque, con el aviso de
// posición liberada en `aria-live` (SPEC FE14a §3.1, §2). Local a `features/finalClassification/`:
// tres usos, los tres en `FinalClassificationStep` — no es primitiva (`ARCHITECTURE.md` §4.3
// exige más de una pantalla).
export function ImportanceSelect({
  label,
  value,
  onChange,
  releasedToBlock,
  disabled,
}: ImportanceSelectProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <CatalogSelect
        typeCode="finalClassificationImportance"
        emit="id"
        value={value}
        onChange={onChange}
        ariaLabel={label}
        disabled={disabled}
      />
      {releasedToBlock && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {t('finalClassification.importance.released', { block: releasedToBlock })}
        </p>
      )}
    </div>
  );
}
