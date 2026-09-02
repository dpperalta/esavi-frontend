import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/components/ui/badge';
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
import { catalogTypeResource } from './api';

interface CatalogTypeSelectProps {
  // Always a string, never `undefined` — passing `undefined` to a controlled Radix `<Select>`
  // turns it uncontrolled (SPEC FE05 §3.1). Callers pass `''` for "no type chosen".
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  id?: string;
}

// SPEC FE03 §2: lives in `features/catalogType/`, not `features/catalogItem/` — it's a combo
// over catalogType data, and any future screen that needs to choose a type reuses it rather than
// copying it (CONVENTIONS.md §10.4). A single `limit: 100` request, no `useInfiniteQuery`: with
// ~18 types seeded that would solve a problem that doesn't exist yet — the warning below is what
// makes the day it does exist visible, instead of silently hiding types.
export function CatalogTypeSelect({
  value,
  onValueChange,
  onClear,
  disabled,
  id,
}: CatalogTypeSelectProps) {
  const { t } = useTranslation();
  // Distinct cache entry from the one `CatalogTypeListPage` uses (`limit: pageSize`) — two
  // queries with a different `limit`, not a duplicated read (SPEC FE03 §3.4). `inactiveMode`
  // is `'serverDecides'` here (SPEC FE02 §1 finding B): the backend already returns only active
  // types below ADMIN, so there's no `includeInactive` to pass.
  const list = catalogTypeResource.useList({ pageSize: 100 });

  if (list.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (list.isError) {
    const message =
      list.error instanceof EsaviApiError ? getErrorMessage(list.error) : t('common.errors.unexpected');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-label={t('catalogType.select.label')}
          onClear={onClear}
        >
          <SelectValue placeholder={t('catalogType.select.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {rows.map((row) => (
            <SelectItem
              key={row.catalogTypeId}
              value={row.catalogTypeId}
              className={row.isActive ? undefined : 'text-destructive'}
            >
              {row.name}
              {!row.isActive && (
                <Badge variant="destructive">{t('catalogType.status.inactive')}</Badge>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {count > 100 && (
        <p className="text-xs text-muted-foreground">{t('catalogType.select.tooManyTypes')}</p>
      )}
    </div>
  );
}
