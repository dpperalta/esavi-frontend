import { useTranslation } from 'react-i18next';
import { catalogItemResource } from '@/features/catalogItem/api';
import { catalogTypeResource } from '@/features/catalogType/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';

export interface CatalogSelectProps {
  typeCode: string;
  // What `value`/`onChange` carry: the item's `code` (e.g. `IN_INVESTIGATION`) by default — every
  // consumer up to FE09 reaches it from a URL filter, and a URL holds a stable, human-legible
  // code, never an opaque UUID a stale seed could regenerate on reseed. FE10 needs the other hop:
  // `sexItemId`/`professionItemId` are `catalogItemId` in the validators, so it passes `emit="id"`
  // instead of resolving code → id by hand at each of its two consumers (CONVENTIONS.md §10.4).
  value: string | null;
  onChange: (value: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  emit?: 'id' | 'code';
}

// ESAVI-CATTYPE-002 (resolves `typeCode` → `catalogTypeId`) + ESAVI-CATITEM-002A/002B (items of
// that type) — the primitive of ARCHITECTURE.md §4.3, adelantada por SPEC FE09 §1E: the two-hop
// resolution HealthFacilityListPage.tsx:117-131 already writes by hand. Both resources declare
// their own 30-minute `staleTime` (CONVENTIONS.md §6.3); nothing is redeclared here, so two
// instances with the same `typeCode` share both cache entries and cost one request per hop, not
// one per instance.
export function CatalogSelect({ typeCode, value, onChange, ariaLabel, disabled, emit = 'code' }: CatalogSelectProps) {
  const { t } = useTranslation();
  const typesList = catalogTypeResource.useList({ pageSize: 100 });
  const catalogTypeId =
    typesList.data?.rows.find((row) => row.code === typeCode)?.catalogTypeId ?? '';
  const itemsList = catalogItemResource.useListByParent!(catalogTypeId, { pageSize: 100 });

  if (typesList.isLoading || itemsList.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (typesList.isError || itemsList.isError) {
    const error = typesList.isError ? typesList.error : itemsList.error;
    const message =
      error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void typesList.refetch();
            void itemsList.refetch();
          }}
        >
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  // An unknown `typeCode` — the catalog seed doesn't have it. Left empty and disabled instead of
  // thrown: a missing seed row is not a reason to break the screen around it.
  if (!catalogTypeId) {
    return (
      <Select value="" disabled>
        <SelectTrigger className="w-full" aria-label={ariaLabel} clearable={false}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  const rows = itemsList.data?.rows ?? [];
  const emittedValue = (row: (typeof rows)[number]) => (emit === 'id' ? row.catalogItemId : row.code);

  return (
    <Select value={value ?? ''} onValueChange={(nextValue) => onChange(nextValue || null)} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label={ariaLabel} onClear={() => onChange(null)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.catalogItemId} value={emittedValue(row)}>
            {row.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
