import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EsaviApiError } from '@/shared/api/types';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { catalogTypeResource } from '@/features/catalogType/api';
import { catalogItemResource } from './api';

interface CatalogSelectProps {
  typeCode: string;
  // Always a string, never `undefined` — passing `undefined` to a controlled Radix `<Select>`
  // turns it uncontrolled (SPEC FE05 §3.1). Callers pass `''` for "no item chosen".
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  id?: string;
}

// SPEC FE06 §3.4: resolves a `catalogType.code` to its active `catalogItem` options, in two
// hops — first `catalogTypeResource.useList` (shared cache entry with `<CatalogTypeSelect>`),
// then `catalogItemResource.useListByParent`, which only starts once the type id is known
// (`enabled: !!parentId` inside the factory). Lives in `features/catalogItem/` rather than
// `shared/`, same precedent as `<CatalogTypeSelect>` in `features/catalogType/` (CONVENTIONS.md
// §10.4): a combo over an entity's data belongs to that entity's feature.
export function CatalogSelect({
  typeCode,
  value,
  onValueChange,
  onClear,
  disabled,
  id,
}: CatalogSelectProps) {
  const { t } = useTranslation();
  const typeList = catalogTypeResource.useList({ pageSize: 100 });
  const catalogTypeId =
    typeList.data?.rows.find((row) => row.code === typeCode)?.catalogTypeId ?? '';
  const itemList = catalogItemResource.useListByParent(catalogTypeId, { pageSize: 100 });

  if (typeList.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (typeList.isError) {
    const message =
      typeList.error instanceof EsaviApiError
        ? getErrorMessage(typeList.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void typeList.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  // Finding G: no `catalogType` carries this `code` — the combo is disabled instead of loading
  // forever, and the second request never fires (`catalogTypeId` stays `''`).
  if (!catalogTypeId) {
    return (
      <Select value="" disabled>
        <SelectTrigger id={id} className="w-full" aria-label={t('catalogItem.select.label')}>
          <SelectValue placeholder={t('catalogItem.select.unknownType')} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (itemList.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (itemList.isError) {
    const message =
      itemList.error instanceof EsaviApiError
        ? getErrorMessage(itemList.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void itemList.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const rows = itemList.data?.rows ?? [];

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className="w-full"
        aria-label={t('catalogItem.select.label')}
        onClear={onClear}
      >
        <SelectValue placeholder={t('catalogItem.select.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.catalogItemId} value={row.catalogItemId}>
            {row.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
