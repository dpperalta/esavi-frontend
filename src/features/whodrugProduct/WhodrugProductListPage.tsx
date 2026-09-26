import { RefreshCw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { WhodrugProductRow } from '@/contracts/declared/whodrugProduct';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceTable, type ResourceTableColumn } from '@/shared/components/ResourceTable';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { useWhodrugProductList, WHODRUG_PRODUCT_FILTER_MIN_LENGTH } from './api';
import { WhodrugProductSheet } from './WhodrugProductSheet';

const DEBOUNCE_MS = 400;
const SYNC_PATH = '/whodrug-products/sync';

type FilterKey = 'name' | 'ingredient';

function meetsMinLength(value: string): boolean {
  return value.trim().length >= WHODRUG_PRODUCT_FILTER_MIN_LENGTH;
}

// A typing buffer for a text filter that lives in `searchParams` (SPEC FE25d §3.4). The URL is
// written once the user stops typing, and only with 3+ characters: below the 002B's minimum the
// parameter is removed rather than kept, so the URL never holds a filter the list is not applying.
function useDebouncedParam(key: FilterKey) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buffer, setBuffer] = useState(searchParams.get(key) ?? '');

  useEffect(() => {
    const timeout = setTimeout(() => {
      // The functional form reads the URL at write time, so the other filter, changed while this
      // one was being typed, is not overwritten.
      setSearchParams((current) => {
        const value = meetsMinLength(buffer) ? buffer.trim() : '';
        if (value === (current.get(key) ?? '')) {
          return current;
        }
        const next = new URLSearchParams(current);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        next.delete('page');
        return next;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Re-runs only when the typed value changes — `searchParams` would refire it on every
    // navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  return [buffer, setBuffer] as const;
}

interface FilterFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

function FilterField({ label, hint, value, onChange }: FilterFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const isBelowMinimum = value.trim().length > 0 && !meetsMinLength(value);

  return (
    <div className="flex w-full flex-col gap-1.5 md:w-72">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        className="min-h-11 md:min-h-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {isBelowMinimum ? t('whodrugProduct.filters.minChars') : hint}
      </p>
    </div>
  );
}

function TruncatedText({ value }: { value: string | null }) {
  if (!value) {
    return <span aria-hidden="true">—</span>;
  }
  return (
    <span className="block max-w-full truncate md:max-w-xs" title={value}>
      {value}
    </span>
  );
}

// SPEC FE25d §3.1: an inspection list of the WHODrug mirror. No row actions — there is no
// mutation per row — and no inactive toggle: the 002B always includes the retired rows.
export function WhodrugProductListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const pageSize = usePreferencesStore((state) => state.pageSize);

  const name = searchParams.get('name') ?? '';
  const ingredient = searchParams.get('ingredient') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [nameInput, setNameInput] = useDebouncedParam('name');
  const [ingredientInput, setIngredientInput] = useDebouncedParam('ingredient');
  // §3.4: only the id. The row is resolved from `rows` on every render, never copied.
  const [openId, setOpenId] = useState<string | null>(null);

  // ESAVI-WHODPROD-002B
  const list = useWhodrugProductList({ page, pageSize, name, ingredient });
  const openRow = list.data?.rows.find((row) => row.whodrugProductId === openId) ?? null;

  // §3.4: when the page or the filters change and the open row is no longer in `rows`, the panel
  // closes for good — the id must not survive to reopen it on a later page that holds the row again.
  useEffect(() => {
    if (openId !== null && list.data && openRow === null) {
      setOpenId(null);
    }
  }, [openId, list.data, openRow]);

  const isFiltered = meetsMinLength(name) || meetsMinLength(ingredient);

  function handleClearFilters() {
    setNameInput('');
    setIngredientInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('name');
    next.delete('ingredient');
    next.delete('page');
    setSearchParams(next);
  }

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  }

  const columns: ResourceTableColumn<WhodrugProductRow>[] = [
    {
      key: 'drugName',
      header: 'whodrugProduct.fields.drugName',
      // The way into the panel: a real button, so Tab + Enter opens it and the panel can hand
      // focus back to it on close (§3.7).
      render: (row) => (
        <button
          type="button"
          onClick={() => setOpenId(row.whodrugProductId)}
          title={row.drugName}
          className="block min-h-11 max-w-full truncate rounded-sm text-left font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0 md:max-w-xs"
        >
          {row.drugName}
        </button>
      ),
      card: 'primary',
    },
    {
      key: 'drugCode',
      header: 'whodrugProduct.fields.drugCode',
      render: (row) => <span className="font-mono text-xs">{row.drugCode}</span>,
      card: 'meta',
    },
    {
      key: 'ingredientTranslations',
      header: 'whodrugProduct.fields.ingredientTranslations',
      render: (row) => <TruncatedText value={row.ingredientTranslations} />,
      card: 'secondary',
    },
    {
      key: 'atcs',
      header: 'whodrugProduct.fields.atcs',
      render: (row) =>
        row.atcs ? (
          <span className="font-mono text-xs">{row.atcs}</span>
        ) : (
          <span aria-hidden="true">—</span>
        ),
    },
    {
      key: 'iso3Code',
      header: 'whodrugProduct.fields.iso3Code',
      render: (row) => row.iso3Code ?? <span aria-hidden="true">—</span>,
      card: 'meta',
    },
    {
      key: 'maHolders',
      header: 'whodrugProduct.fields.maHolders',
      render: (row) => <TruncatedText value={row.maHolders} />,
    },
    {
      key: 'presentation',
      // `form · strength` share one column; the section heading names exactly that pair.
      header: 'whodrugProduct.sections.presentation',
      render: (row) => (
        <TruncatedText value={[row.form, row.strength].filter(Boolean).join(' · ') || null} />
      ),
    },
    {
      key: 'isActive',
      header: 'whodrugProduct.fields.isActive',
      render: (row) =>
        row.isActive ? (
          <Badge variant="outline">{t('whodrugProduct.status.active')}</Badge>
        ) : (
          <Badge variant="destructive">{t('whodrugProduct.status.retired')}</Badge>
        ),
      // In the card too: the tint alone doesn't say "retired" (CONVENTIONS.md §10.1).
      card: 'meta',
    },
  ];

  const syncButton = (
    <Button asChild variant="outline" size="touch" className="md:h-8">
      <Link to={SYNC_PATH}>
        <RefreshCw aria-hidden="true" />
        {t('whodrugProduct.list.sync')}
      </Link>
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">{t('whodrugProduct.list.title')}</h1>
        {isSuperAdmin && syncButton}
      </div>

      {/* §3.7: two fields only, so they stack full width below md instead of hiding in a Sheet. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <FilterField
          label={t('whodrugProduct.filters.name')}
          hint={t('whodrugProduct.filters.nameHint')}
          value={nameInput}
          onChange={setNameInput}
        />
        <FilterField
          label={t('whodrugProduct.filters.ingredient')}
          hint={t('whodrugProduct.filters.ingredientHint')}
          value={ingredientInput}
          onChange={setIngredientInput}
        />
      </div>

      <ResourceTable<WhodrugProductRow>
        columns={columns}
        data={list.data}
        idField="whodrugProductId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        // No `onIncludeInactiveChange`: without it the table renders no toggle (§2).
        inactiveMode="adminPath"
        emptyKey="whodrugProduct.list.empty"
        emptyExtraAction={isSuperAdmin ? syncButton : undefined}
        isFiltered={isFiltered}
        emptyFilteredKey="whodrugProduct.list.emptyFiltered"
        onClearFilters={handleClearFilters}
        clearFiltersLabel="whodrugProduct.list.clearFilters"
        isRowInactive={(row) => !row.isActive}
      />

      <WhodrugProductSheet row={openRow} onClose={() => setOpenId(null)} />
    </div>
  );
}
