import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { UserGeoCoverage } from '@/contracts/declared/userGeoLocation';
import { useCurrentUser } from '@/features/auth/api';
import { useUserGeoCoverage } from '@/features/userGeoLocation/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

// Radix <Select> rejects an empty-string item value, so «Toda mi cobertura» needs a sentinel.
const ALL_COVERAGE = '__all__';

// Above this a flat <Select> stops being scannable (SPEC FE35 §7): the coverage is already
// expanded and in cache, so the searchable variant filters it in memory.
const SEARCHABLE_THRESHOLD = 50;

interface DashboardGeoFilterProps {
  // The geoLocationId useDashboardPeriod() kept — already dropped if it was out of coverage.
  value: string | undefined;
}

// Three branches by level, never by role name (SPEC FE35 §3.1): both unit sources —
// ESAVI-USERGEO-008 and ESAVI-GEOLOC-002 — are USER, so ANALYTICS is never offered either.
export function DashboardGeoFilter({ value }: DashboardGeoFilterProps) {
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const canUseCoverage = useCan(ROLE_LEVELS.USER);
  const [, setSearchParams] = useSearchParams();

  // Only this key is touched, on a copy of the current params, so the period survives.
  function writeGeoLocationId(geoLocationId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (geoLocationId) next.set('geoLocationId', geoLocationId);
      else next.delete('geoLocationId');
      return next;
    });
  }

  if (isAdmin) return <TreeGeoFilter value={value} onChange={writeGeoLocationId} />;
  if (canUseCoverage) return <CoverageGeoFilter value={value} onChange={writeGeoLocationId} />;
  return <AnalyticsScope hasUnit={value !== undefined} onShowAll={() => writeGeoLocationId(null)} />;
}

interface GeoFilterBranchProps {
  value: string | undefined;
  onChange: (geoLocationId: string | null) => void;
}

function TreeGeoFilter({ value, onChange }: GeoFilterBranchProps) {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-1.5 md:w-64">
      <span id={labelId} className="text-sm font-medium text-foreground">
        {t('dashboard.period.geo')}
      </span>
      {/* ESAVI-GEOLOC-002 — the whole tree, loaded level by level by the primitive itself */}
      <GeoLocationPicker value={value ?? null} onChange={onChange} />
    </div>
  );
}

function CoverageGeoFilter({ value, onChange }: GeoFilterBranchProps) {
  const { t } = useTranslation();
  const triggerId = useId();
  const { data: user } = useCurrentUser();
  // ESAVI-USERGEO-008 — the user's expanded coverage, shared cache with useDashboardPeriod()
  const coverage = useUserGeoCoverage(user?.userId ?? '');

  if (coverage.isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5 md:w-64">
        <Label htmlFor={triggerId}>{t('dashboard.period.geo')}</Label>
        <Skeleton className="h-8 w-full pointer-coarse:h-11" />
      </div>
    );
  }

  if (coverage.isError || !coverage.data) {
    const message =
      coverage.error instanceof EsaviApiError
        ? getErrorMessage(coverage.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex min-w-0 flex-col gap-1.5 md:w-64">
        <span className="text-sm font-medium text-foreground">{t('dashboard.period.geo')}</span>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">{message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void coverage.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const units = coverage.data.coverage;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 md:w-64">
      <Label htmlFor={triggerId}>{t('dashboard.period.geo')}</Label>
      {units.length > SEARCHABLE_THRESHOLD ? (
        <SearchableCoverageSelect units={units} value={value} onChange={onChange} />
      ) : (
        <Select
          value={value ?? ALL_COVERAGE}
          onValueChange={(next) => onChange(next === ALL_COVERAGE ? null : next)}
        >
          <SelectTrigger id={triggerId} className="w-full" clearable={false}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COVERAGE}>{t('dashboard.period.allCoverage')}</SelectItem>
            {units.map((unit) => (
              <SelectItem
                key={unit.geoLocationId}
                value={unit.geoLocationId}
                // Inline because the depth is data, not a fixed set of classes Tailwind can see.
                style={{ paddingInlineStart: `${0.5 + indentDepth(units, unit.level) * 1}rem` }}
              >
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

type CoverageUnit = UserGeoCoverage['coverage'][number];

// Relative to the shallowest unit the user covers: someone assigned a province starts at zero
// there, not at the country's depth.
function indentDepth(units: CoverageUnit[], level: number): number {
  const shallowest = Math.min(...units.map((unit) => unit.level));
  return level - shallowest;
}

interface SearchableCoverageSelectProps {
  units: CoverageUnit[];
  value: string | undefined;
  onChange: (geoLocationId: string | null) => void;
}

function SearchableCoverageSelect({ units, value, onChange }: SearchableCoverageSelectProps) {
  const { t } = useTranslation();
  // What is being typed in the popover — UI state, not a filter: the URL keeps only the choice.
  const [search, setSearch] = useState('');
  const needle = search.trim().toLocaleLowerCase();
  const options = units
    .filter((unit) => needle === '' || unit.name.toLocaleLowerCase().includes(needle))
    .map((unit) => ({ value: unit.geoLocationId, label: unit.name }));

  return (
    <SearchableSelect
      value={value ?? null}
      onChange={onChange}
      search={search}
      onSearchChange={setSearch}
      options={options}
      placeholder={t('dashboard.period.allCoverage')}
      ariaLabel={t('dashboard.period.geo')}
      emptyMessage={t('common.table.emptyFiltered')}
      selectedLabel={units.find((unit) => unit.geoLocationId === value)?.name}
    />
  );
}

interface AnalyticsScopeProps {
  hasUnit: boolean;
  onShowAll: () => void;
}

// No selector: ANALYTICS has no route to list its own units (SPEC FE35 §2). A geoLocationId here
// was written by FE36c's map, from rows the server had already scoped.
function AnalyticsScope({ hasUnit, onShowAll }: AnalyticsScopeProps) {
  const { t } = useTranslation();

  if (!hasUnit) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.period.wholeTerritory')}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-sm text-foreground">{t('dashboard.period.selectedUnit')}</p>
      <Button type="button" variant="link" className="h-8 px-0 pointer-coarse:h-11" onClick={onShowAll}>
        {t('dashboard.period.wholeTerritoryLink')}
      </Button>
    </div>
  );
}
