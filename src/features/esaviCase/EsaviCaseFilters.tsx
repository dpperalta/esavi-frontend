import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { XIcon } from 'lucide-react';
import { useHealthFacilitySearch } from '@/features/healthFacility/api';
import { DateField } from '@/shared/components/DateField';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';

// The debounce criterion of `code` and of the health-facility search below — same value
// HealthFacilityListPage's own search field uses, and the one F52 requires for `code`.
const SEARCH_DEBOUNCE_MS = 400;

const DATE_COLUMNS = ['reportDate', 'eventDate', 'reportFillingDate'] as const;
type DateColumn = (typeof DATE_COLUMNS)[number];
type DateMode = 'exact' | 'range';

// The fourteen (thirteen real, per `EsaviCaseListFilters`) query keys `esaviCaseFiltersSchema`
// parses — SPEC FE09 §3.7's filter-count badge is derived from this list, never stored.
export const ESAVI_CASE_FILTER_PARAM_KEYS = [
  'code',
  'patientId',
  'healthFacilityId',
  'geoLocationId',
  'reportDate',
  'reportDateFrom',
  'reportDateTo',
  'eventDate',
  'eventDateFrom',
  'eventDateTo',
  'reportFillingDate',
  'reportFillingDateFrom',
  'reportFillingDateTo',
] as const;

// How many of the fourteen filters (§3.7) are actually present in the URL — the badge on the
// mobile filter sheet's trigger button reads this, always derived from `searchParams`.
export function countActiveEsaviCaseFilters(searchParams: URLSearchParams): number {
  return ESAVI_CASE_FILTER_PARAM_KEYS.filter((key) => !!searchParams.get(key)).length;
}

export interface EsaviCaseFiltersProps {
  // Resolved by the caller (EsaviCaseListPage) from the first row of its own list query, per
  // SPEC FE09 §3.2: no second request for the patient's name, and nothing copied to state here
  // — this component only reads `patientId` from the URL and shows whatever name it's given.
  patientName?: string;
}

function useDebouncedWriter(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  paramKey: string,
  currentValue: string,
  minLength: number,
) {
  const [draft, setDraft] = useState(currentValue);

  useEffect(() => {
    setDraft(currentValue);
  }, [currentValue]);

  useEffect(() => {
    const trimmed = draft.trim();
    const handle = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed.length >= minLength) {
            next.set(paramKey, trimmed);
          } else {
            next.delete(paramKey);
          }
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on `draft` only; re-running on `setSearchParams`/`paramKey`/`minLength` would restart the debounce for no reason.
  }, [draft]);

  return [draft, setDraft] as const;
}

function CodeFilter({
  value,
  setSearchParams,
}: {
  value: string;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useDebouncedWriter(setSearchParams, 'code', value, 2);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="esaviCaseFilters-code">{t('esaviCase.filters.code.label')}</Label>
      <Input
        id="esaviCaseFilters-code"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('esaviCase.filters.code.placeholder')}
      />
    </div>
  );
}

function PatientCapsule({
  patientId,
  patientName,
  setSearchParams,
}: {
  patientId: string;
  patientName?: string;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm">
      <span>
        {t('esaviCase.filters.patient.prefix')}: {patientName ?? patientId}
      </span>
      <button
        type="button"
        aria-label={t('esaviCase.filters.patient.clearAria')}
        className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-full"
        onClick={() =>
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('patientId');
            return next;
          })
        }
      >
        <XIcon aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

// Ad-hoc stand-in for `<EntitySearchSelect>` (not built until FE10, SPEC FE09 §3.5): resolves
// against ESAVI-HFAC-006, the same search HealthFacilityListPage already consumes. A selected
// facility collapses to a read-only chip with a "change" button, same shape GeoLocationPicker
// uses for its own resolved value.
function HealthFacilityFilter({
  value,
  setSearchParams,
}: {
  value: string;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [editing, setEditing] = useState(value === '');

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const search = useHealthFacilitySearch({ q: debouncedQuery, pageSize: 10 });

  function select(id: string, name: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('healthFacilityId', id);
      return next;
    });
    setQuery(name);
    setEditing(false);
  }

  function clear() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('healthFacilityId');
      return next;
    });
    setQuery('');
    setEditing(true);
  }

  if (!editing && value) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{t('esaviCase.filters.healthFacility.label')}</Label>
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-sm text-foreground">{query || value}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t('esaviCase.filters.healthFacility.change')}
            </Button>
            <button
              type="button"
              aria-label={t('common.select.clear')}
              className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={clear}
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const rows = search.data?.rows ?? [];

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label htmlFor="esaviCaseFilters-healthFacility">{t('esaviCase.filters.healthFacility.label')}</Label>
      <Input
        id="esaviCaseFilters-healthFacility"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('esaviCase.filters.healthFacility.placeholder')}
        onBlur={() => {
          // Nothing picked, and the box is back to what the URL already has: fall back to the
          // read-only chip instead of leaving a dangling empty search box (SPEC FE09 §3.5).
          window.setTimeout(() => {
            if (value) setEditing(false);
          }, 150);
        }}
      />
      {debouncedQuery.trim().length >= 2 && rows.length > 0 && (
        <ul className="absolute top-full z-10 mt-1 w-full rounded-lg border bg-popover shadow-md ring-1 ring-foreground/10">
          {rows.map((row) => (
            <li key={row.healthFacilityId}>
              <button
                type="button"
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => select(row.healthFacilityId, row.name)}
              >
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DateColumnFilter({
  column,
  setSearchParams,
  urlExact,
  urlFrom,
  urlTo,
}: {
  column: DateColumn;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  urlExact: string;
  urlFrom: string;
  urlTo: string;
}) {
  const { t } = useTranslation();
  const derivedMode: DateMode | null = urlExact ? 'exact' : urlFrom || urlTo ? 'range' : null;
  const [localMode, setLocalMode] = useState<DateMode>('exact');
  const mode = derivedMode ?? localMode;

  const [draftFrom, setDraftFrom] = useState(urlFrom);
  const [draftTo, setDraftTo] = useState(urlTo);
  useEffect(() => setDraftFrom(urlFrom), [urlFrom]);
  useEffect(() => setDraftTo(urlTo), [urlTo]);

  const rangeInvalid = !!draftFrom && !!draftTo && draftFrom > draftTo;

  function writeParams(mutate: (next: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  }

  // Changing mode clears the abandoned mode's params in this same write (§3.4, §3.5 rule 1):
  // the combination the backend rejects with 400 becomes unreachable, not merely undone.
  function handleModeChange(nextMode: DateMode) {
    setLocalMode(nextMode);
    writeParams((next) => {
      if (nextMode === 'exact') {
        next.delete(`${column}From`);
        next.delete(`${column}To`);
      } else {
        next.delete(column);
      }
    });
  }

  function handleExactChange(nextValue: string | null) {
    writeParams((next) => {
      if (nextValue) next.set(column, nextValue);
      else next.delete(column);
    });
  }

  function handleFromChange(nextValue: string | null) {
    setDraftFrom(nextValue ?? '');
    // From > To (rule 2, §3.5): not written until it resolves — the inline message below is
    // the only feedback, never a request the backend would 400.
    if (nextValue && draftTo && nextValue > draftTo) return;
    writeParams((next) => {
      if (nextValue) next.set(`${column}From`, nextValue);
      else next.delete(`${column}From`);
    });
  }

  function handleToChange(nextValue: string | null) {
    setDraftTo(nextValue ?? '');
    if (draftFrom && nextValue && draftFrom > nextValue) return;
    writeParams((next) => {
      if (nextValue) next.set(`${column}To`, nextValue);
      else next.delete(`${column}To`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <RadioGroup
        value={mode}
        onValueChange={(next) => handleModeChange(next as DateMode)}
        aria-label={t(`esaviCase.filters.${column}.groupLabel`)}
        className="grid grid-cols-2 gap-1 rounded-lg border p-1"
      >
        <label className="relative flex cursor-pointer items-center justify-center">
          <RadioGroupItem value="exact" className="peer sr-only" />
          <span className="flex w-full items-center justify-center rounded-md py-1 text-sm text-muted-foreground peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground">
            {t('esaviCase.filters.dateMode.exact')}
          </span>
        </label>
        <label className="relative flex cursor-pointer items-center justify-center">
          <RadioGroupItem value="range" className="peer sr-only" />
          <span className="flex w-full items-center justify-center rounded-md py-1 text-sm text-muted-foreground peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground">
            {t('esaviCase.filters.dateMode.range')}
          </span>
        </label>
      </RadioGroup>
      {mode === 'exact' ? (
        <DateField
          value={urlExact || null}
          onChange={handleExactChange}
          ariaLabel={t(`esaviCase.filters.${column}.exactLabel`)}
          allowFuture
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <DateField
            value={draftFrom || null}
            onChange={handleFromChange}
            ariaLabel={t(`esaviCase.filters.${column}.fromLabel`)}
            allowFuture
          />
          <DateField
            value={draftTo || null}
            onChange={handleToChange}
            ariaLabel={t(`esaviCase.filters.${column}.toLabel`)}
            allowFuture
          />
          {rangeInvalid && (
            <p role="alert" className="text-sm text-destructive">
              {t('esaviCase.filters.errors.rangeInvalid')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// The fourteen (thirteen real) controls of the «Por caso» tab (SPEC FE09 §3.5). Writes directly
// to `searchParams` — there is no other state, per §3.4: filters, paging and their derived UI
// (the date columns' Exacta/Rango mode) all live in the URL or are re-derived from it.
export function EsaviCaseFilters({ patientName }: EsaviCaseFiltersProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const patientId = searchParams.get('patientId') ?? '';
  const healthFacilityId = searchParams.get('healthFacilityId') ?? '';
  const geoLocationId = searchParams.get('geoLocationId');

  return (
    <div className="flex flex-col gap-4">
      <CodeFilter value={searchParams.get('code') ?? ''} setSearchParams={setSearchParams} />
      {patientId && (
        <PatientCapsule patientId={patientId} patientName={patientName} setSearchParams={setSearchParams} />
      )}
      <HealthFacilityFilter value={healthFacilityId} setSearchParams={setSearchParams} />
      <div className="flex flex-col gap-1.5">
        <Label>{t('esaviCase.filters.geoLocation.label')}</Label>
        <GeoLocationPicker
          value={geoLocationId}
          onChange={(nextId) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (nextId) next.set('geoLocationId', nextId);
                else next.delete('geoLocationId');
                return next;
              },
              { replace: true },
            )
          }
        />
      </div>
      {DATE_COLUMNS.map((column) => (
        <DateColumnFilter
          key={column}
          column={column}
          setSearchParams={setSearchParams}
          urlExact={searchParams.get(column) ?? ''}
          urlFrom={searchParams.get(`${column}From`) ?? ''}
          urlTo={searchParams.get(`${column}To`) ?? ''}
        />
      ))}
    </div>
  );
}
