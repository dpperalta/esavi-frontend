import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/api';
import { useHealthFacilitySearch } from '@/features/healthFacility/api';
import { useUserGeoCoverage } from '@/features/userGeoLocation/api';
import { EsaviApiError } from '@/shared/api/types';
import { EntitySearchSelect, type EntitySearchOption } from '@/shared/components/EntitySearchSelect';
import { ROLE_LEVELS, getEffectiveLevel } from '@/shared/config/roles';

export interface ScopedHealthFacilitySelectProps {
  value: string | null;
  resolvedLabel?: string | null;
  onChange: (option: EntitySearchOption | null) => void;
}

// `<EntitySearchSelect>` over ESAVI-HFAC-006, crossed with ESAVI-USERGEO-008 (SPEC FE10 §1C, §4
// paso 11). The filter only applies at exactly `USER` level — the same threshold
// `resolveUserGeoScopeIds` uses on the backend: an ADMIN or above sees the whole national table
// unfiltered, because the `POST` doesn't restrict them either (§6, decisión tomada). Out-of-scope
// facilities stay in the list, disabled with their reason visible — hiding them reproduces
// exactly the "unidad no encontrada" confusion the reason exists to prevent (§1C).
export function ScopedHealthFacilitySelect({ value, resolvedLabel, onChange }: ScopedHealthFacilitySelectProps) {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const appliesFilter = !!user && getEffectiveLevel(user.roles) === ROLE_LEVELS.USER;

  const coverage = useUserGeoCoverage(appliesFilter ? user.userId : '');
  // Crossed against `coverage` — the full recursive expansion, which already includes the
  // assigned nodes themselves — never against `assigned` alone (SPEC FE10 §3.3): someone with a
  // province assigned can still notify at a facility in one of its cantons, which is in
  // `coverage` and not in `assigned`.
  const coverageIds = new Set((coverage.data?.coverage ?? []).map((location) => location.geoLocationId));

  const [query, setQuery] = useState('');
  const search = useHealthFacilitySearch({ q: query, pageSize: 10 });

  const options: EntitySearchOption[] = (search.data?.rows ?? []).map((row) => {
    // A facility with no resolved location can't be checked against coverage — left elegible
    // rather than blocked by data this selector has no way to evaluate.
    const inCoverage = !appliesFilter || !row.geoLocation || coverageIds.has(row.geoLocation.geoLocationId);
    return {
      id: row.healthFacilityId,
      label: row.name,
      disabled: !inCoverage,
      disabledReason: inCoverage ? undefined : t('esaviCase.opening.healthFacility.outOfCoverage'),
    };
  });

  return (
    <EntitySearchSelect
      value={value}
      resolvedLabel={resolvedLabel}
      onChange={onChange}
      onQueryChange={setQuery}
      options={options}
      isLoading={search.isFetching || (appliesFilter && coverage.isLoading)}
      isError={search.isError}
      error={search.error instanceof EsaviApiError ? search.error : undefined}
      onRetry={() => void search.refetch()}
      placeholder={t('esaviCase.opening.healthFacility.placeholder')}
      ariaLabel={t('esaviCase.opening.healthFacility.label')}
      changeLabel={t('esaviCase.opening.healthFacility.change')}
      emptyMessage={t('esaviCase.opening.healthFacility.empty')}
    />
  );
}
