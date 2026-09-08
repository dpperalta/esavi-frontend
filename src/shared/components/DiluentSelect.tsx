import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { diluentResource } from '@/features/diluent/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SearchableSelect } from '@/shared/components/SearchableSelect';

export interface DiluentSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
}

// The envoltura of SPEC FE12c §2/§6: `diluentCatalog` is its own entity — `ESAVI-DILUENT-001`…
// `005B` — not a `catalogType`, so `<CatalogSelect>` doesn't fit it. `<SearchableSelect>` does the
// filtering; this wrapper only ever fetches ESAVI-DILUENT-002A (100 rows, matching `<CatalogSelect>`'s
// own "small enough to fetch whole" assumption) and disables itself with an explanation the moment
// the master has no seeds — the deployment state every environment is in today (§10.5).
export function DiluentSelect({ value, onChange, ariaLabel, disabled }: DiluentSelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const list = diluentResource.useList({ pageSize: 100 });

  if (list.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (list.isError) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">
          {list.error instanceof EsaviApiError ? getErrorMessage(list.error) : t('common.errors.unexpected')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const rows = list.data?.rows ?? [];

  // Empty on purpose (§10.5): every deployment today has no seeds for this master, and the
  // guarda de contenido mínimo already lets the caller register the diluent by `diluentName`.
  if (rows.length === 0) {
    return (
      <SearchableSelect
        value={null}
        onChange={() => {}}
        search=""
        onSearchChange={() => {}}
        options={[]}
        placeholder={ariaLabel}
        ariaLabel={ariaLabel}
        emptyMessage={t('diluent.select.empty')}
        disabled
        disabledReason={t('diluent.select.empty')}
      />
    );
  }

  const trimmed = search.trim().toLowerCase();
  const filtered = trimmed === '' ? rows : rows.filter((row) => row.name.toLowerCase().includes(trimmed));

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      search={search}
      onSearchChange={setSearch}
      options={filtered.map((row) => ({ value: row.diluentCatalogId, label: row.name }))}
      selectedLabel={rows.find((row) => row.diluentCatalogId === value)?.name}
      minLength={0}
      placeholder={ariaLabel}
      ariaLabel={ariaLabel}
      emptyMessage={t('diluent.select.empty')}
      disabled={disabled}
    />
  );
}
