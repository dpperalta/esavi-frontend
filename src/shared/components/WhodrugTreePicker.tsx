import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useCountryIsoCode } from '@/features/systemConfig/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SearchableSelect, type SearchableSelectOption } from '@/shared/components/SearchableSelect';
import {
  useVaccineWhodrugDetail,
  useWhodrugTreeLevel,
  type WhodrugTreeAncestorValues,
} from '@/shared/hooks/useVaccineWhodrugTree';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import type { VaccineWhodrugTreeLevel, VaccineWhodrugTreeOption } from '@/contracts/vaccineWhodrug';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';

// The sentinel that stands in for a level's null value while it travels between the client and
// the server (API-CONTRACT.md §11.2, SPEC FE12c §3.2) — reserved because it never occurs in the
// WHODrug dictionary itself.
const NULL_SENTINEL = '__NULL__';

const LEVEL_ORDER: VaccineWhodrugTreeLevel[] = [
  'abbreviation',
  'drugName',
  'maHolders',
  'formTranslations',
  'strength',
];

// `whodrugTreePicker.level.form`, not `.formTranslations` (SPEC FE12c §3.8) — the fourth level's
// i18n key keeps the plugin's own word for the column even though the field it groups is
// `formTranslations`, never the untranslated `form`.
const LEVEL_LABEL_KEYS: Record<VaccineWhodrugTreeLevel, string> = {
  abbreviation: 'whodrugTreePicker.level.abbreviation',
  drugName: 'whodrugTreePicker.level.drugName',
  maHolders: 'whodrugTreePicker.level.maHolders',
  formTranslations: 'whodrugTreePicker.level.form',
  strength: 'whodrugTreePicker.level.strength',
};

export interface WhodrugResolution {
  vaccineWhodrugId: string;
  whoCode: string | null;
  vaccineCode: string | null;
  vaccineName: string;
}

export interface WhodrugTreePickerProps {
  // Controlled from the caller's form (SPEC FE12c §3.4): once set, the tree collapses to the
  // resolved summary and the panel, fed by `ESAVI-WHODRUG-003` on this same id.
  vaccineWhodrugId: string | null;
  // Fires once, after the id a level resolved has its full row back — never with only the id,
  // because `whoCode`/`vaccineCode`/`vaccineName` are copies of `drugCode`/`drugCode`/`drugName`
  // that only the detail row carries (SPEC FE12c §3.5).
  onResolve: (resolution: WhodrugResolution) => void;
  // "Cambiar" clears the caller's three FK-related fields so the tree can be walked again.
  onClear: () => void;
  // The rama cruda of the level-1 action: writes `vaccineName` with the chosen abbreviation and
  // leaves `vaccineWhodrugId`/`whoCode`/`vaccineCode` empty (SPEC FE12c §3.5).
  onAssignAbbreviation: (abbreviation: string) => void;
  disabled?: boolean;
}

function toOption(row: VaccineWhodrugTreeOption, t: TFunction): SearchableSelectOption {
  return {
    value: row.value ?? NULL_SENTINEL,
    label: row.value ?? t('whodrugTreePicker.nullValue'),
    description: t('whodrugTreePicker.matchCount', { count: row.matchCount }),
  };
}

function LevelSelect({
  level,
  ancestors,
  search,
  onSearchChange,
  value,
  onSelect,
  disabled,
}: {
  level: VaccineWhodrugTreeLevel;
  ancestors: WhodrugTreeAncestorValues;
  search: string;
  onSearchChange: (search: string) => void;
  value: string | null;
  onSelect: (option: VaccineWhodrugTreeOption) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const country = useCountryIsoCode().data;
  const query = useWhodrugTreeLevel(level, ancestors, search, language, country);

  if (query.isError) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">
          {query.error instanceof EsaviApiError
            ? getErrorMessage(query.error)
            : t('whodrugTreePicker.error')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const rows = query.data?.options ?? [];
  const options = rows.map((row) => toOption(row, t));

  function handleChange(nextValue: string | null) {
    if (nextValue === null) {
      return;
    }
    const row = rows.find((candidate) => (candidate.value ?? NULL_SENTINEL) === nextValue);
    if (row) {
      onSelect(row);
    }
  }

  return (
    <SearchableSelect
      value={value}
      onChange={handleChange}
      search={search}
      onSearchChange={onSearchChange}
      options={options}
      isLoading={query.isLoading}
      placeholder={t(LEVEL_LABEL_KEYS[level])}
      ariaLabel={t(LEVEL_LABEL_KEYS[level])}
      emptyMessage={t('whodrugTreePicker.noResults')}
      disabled={disabled}
    />
  );
}

function InfoRow({ label, value, t }: { label: string; value: string | null; t: TFunction }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? t('whodrugTreePicker.noInfo')}</span>
    </div>
  );
}

function ResolvedSummary({
  detail,
  onChange,
  disabled,
}: {
  detail: VaccineWhodrugDetail;
  onChange: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div aria-live="polite" className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{detail.drugName}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onChange}>
          {t('whodrugTreePicker.change')}
        </Button>
      </div>
      <div className="flex flex-col">
        <InfoRow label={t('whodrugTreePicker.level.abbreviation')} value={detail.abbreviation} t={t} />
        <InfoRow label={t('whodrugTreePicker.level.drugName')} value={detail.drugName} t={t} />
        <InfoRow label={t('whodrugTreePicker.level.maHolders')} value={detail.maHolders} t={t} />
        <InfoRow label={t('whodrugTreePicker.level.form')} value={detail.formTranslations ?? detail.form} t={t} />
        <InfoRow label={t('whodrugTreePicker.level.strength')} value={detail.strength} t={t} />
        <InfoRow label={t('whodrugTreePicker.info.ingredientTranslation')} value={detail.ingredientTranslation} t={t} />
        <InfoRow label={t('whodrugTreePicker.info.noDose')} value={detail.noDose} t={t} />
      </div>
    </div>
  );
}

// The primitive of ARCHITECTURE.md §4.3 and SPEC FE12c §3: the five WHODrug tree levels, chained
// front to back, with early resolution the moment any level's chosen option carries a
// `vaccineWhodrugId` (`matchCount === 1`) and the raw branch — no diccionario, or "Asignar sólo la
// abreviatura" — always available as an escape hatch.
export function WhodrugTreePicker({
  vaccineWhodrugId,
  onResolve,
  onClear,
  onAssignAbbreviation,
  disabled,
}: WhodrugTreePickerProps) {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const country = useCountryIsoCode().data;

  const [ancestors, setAncestors] = useState<WhodrugTreeAncestorValues>({});
  const [strengthValue, setStrengthValue] = useState<string | null>(null);
  const [searchByLevel, setSearchByLevel] = useState<Record<VaccineWhodrugTreeLevel, string>>({
    abbreviation: '',
    drugName: '',
    maHolders: '',
    formTranslations: '',
    strength: '',
  });
  // Set the instant a level's option carries a `vaccineWhodrugId`, and never cleared except by
  // "Cambiar" — the bridge between "a level just resolved" and `vaccineWhodrugId` becoming the
  // caller's own controlled prop, which may take a render or two once `onResolve` calls the
  // form's `setValue`. Left in place after that (it agrees with the prop once it catches up), the
  // collapsed summary never flashes back to the tree while the caller is mid-render (SPEC FE12c
  // §3.4: the five ancestors are component `useState`, never a copy of server data — this is the
  // one exception, and only until the caller's own copy of the same id exists).
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const activeId = vaccineWhodrugId ?? resolvingId;
  const detailQuery = useVaccineWhodrugDetail(activeId);
  // Checked with no ancestors and no search: the root of the tree is the only level that never
  // requires a parent, so its own emptiness is what "el diccionario no está importado" means
  // (SPEC FE12c §3.6) — checked only while nothing is resolved, so a vaccine picked before the
  // dictionary was cleared still shows its summary.
  const abbreviationQuery = useWhodrugTreeLevel('abbreviation', {}, '', language, country);
  const dictionaryEmpty = !activeId && abbreviationQuery.data?.total === 0;

  useEffect(() => {
    // `vaccineWhodrugId !== resolvingId` is the guard against calling `onResolve` again on every
    // render once the caller's prop has caught up — `resolvingId` itself is deliberately never
    // cleared (see its declaration above), so without this check a `detailQuery.data` refetch
    // with a new object reference would re-fire the callback forever.
    if (resolvingId && vaccineWhodrugId !== resolvingId && detailQuery.data?.vaccineWhodrugId === resolvingId) {
      onResolve({
        vaccineWhodrugId: resolvingId,
        whoCode: detailQuery.data.drugCode,
        vaccineCode: detailQuery.data.drugCode,
        vaccineName: detailQuery.data.drugName,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only when the detail this resolution is waiting on arrives, same reasoning as EntitySearchSelect's echo tracking.
  }, [resolvingId, vaccineWhodrugId, detailQuery.data]);

  function setLevelSearch(level: VaccineWhodrugTreeLevel, value: string) {
    setSearchByLevel((prev) => ({ ...prev, [level]: value }));
  }

  function handleLevelSelect(level: VaccineWhodrugTreeLevel, option: VaccineWhodrugTreeOption) {
    if (option.vaccineWhodrugId) {
      setResolvingId(option.vaccineWhodrugId);
      return;
    }
    const value = option.value ?? NULL_SENTINEL;
    if (level === 'strength') {
      setStrengthValue(value);
      return;
    }
    // Changing an ancestor empties every level below it (SPEC FE12c §4 paso 3) — the cascade is
    // the index of `level` in `LEVEL_ORDER`, not a hand-picked list of keys to delete.
    const levelIndex = LEVEL_ORDER.indexOf(level);
    setAncestors((prev) => {
      const next: WhodrugTreeAncestorValues = {};
      for (let i = 0; i < levelIndex; i++) {
        const previousLevel = LEVEL_ORDER[i];
        if (previousLevel !== 'strength') {
          next[previousLevel] = prev[previousLevel];
        }
      }
      next[level as Exclude<VaccineWhodrugTreeLevel, 'strength'>] = value;
      return next;
    });
    setStrengthValue(null);
    setSearchByLevel((prev) => {
      const next = { ...prev };
      for (let i = levelIndex + 1; i < LEVEL_ORDER.length; i++) {
        next[LEVEL_ORDER[i]] = '';
      }
      return next;
    });
  }

  function handleChangeClicked() {
    onClear();
    setAncestors({});
    setStrengthValue(null);
    setSearchByLevel({ abbreviation: '', drugName: '', maHolders: '', formTranslations: '', strength: '' });
    setResolvingId(null);
  }

  if (activeId) {
    if (detailQuery.isLoading || !detailQuery.data) {
      return <Skeleton className="h-24 w-full" />;
    }
    return <ResolvedSummary detail={detailQuery.data} onChange={handleChangeClicked} disabled={disabled} />;
  }

  if (dictionaryEmpty) {
    return <p className="text-sm text-muted-foreground">{t('whodrugTreePicker.notImported')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <LevelSelect
        level="abbreviation"
        ancestors={ancestors}
        search={searchByLevel.abbreviation}
        onSearchChange={(value) => setLevelSearch('abbreviation', value)}
        value={ancestors.abbreviation ?? null}
        onSelect={(option) => handleLevelSelect('abbreviation', option)}
        disabled={disabled}
      />
      {ancestors.abbreviation !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="self-start"
          onClick={() => onAssignAbbreviation(ancestors.abbreviation!)}
        >
          {t('whodrugTreePicker.assignAbbreviation')}
        </Button>
      )}
      {ancestors.abbreviation !== undefined && (
        <LevelSelect
          level="drugName"
          ancestors={ancestors}
          search={searchByLevel.drugName}
          onSearchChange={(value) => setLevelSearch('drugName', value)}
          value={ancestors.drugName ?? null}
          onSelect={(option) => handleLevelSelect('drugName', option)}
          disabled={disabled}
        />
      )}
      {ancestors.drugName !== undefined && (
        <LevelSelect
          level="maHolders"
          ancestors={ancestors}
          search={searchByLevel.maHolders}
          onSearchChange={(value) => setLevelSearch('maHolders', value)}
          value={ancestors.maHolders ?? null}
          onSelect={(option) => handleLevelSelect('maHolders', option)}
          disabled={disabled}
        />
      )}
      {ancestors.maHolders !== undefined && (
        <LevelSelect
          level="formTranslations"
          ancestors={ancestors}
          search={searchByLevel.formTranslations}
          onSearchChange={(value) => setLevelSearch('formTranslations', value)}
          value={ancestors.formTranslations ?? null}
          onSelect={(option) => handleLevelSelect('formTranslations', option)}
          disabled={disabled}
        />
      )}
      {ancestors.formTranslations !== undefined && (
        <LevelSelect
          level="strength"
          ancestors={ancestors}
          search={searchByLevel.strength}
          onSearchChange={(value) => setLevelSearch('strength', value)}
          value={strengthValue}
          onSelect={(option) => handleLevelSelect('strength', option)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
