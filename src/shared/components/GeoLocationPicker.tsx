import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { geoLocationResource } from '@/features/geoLocation/api';
import { geoLevelTypeResource } from '@/features/geoLevelType/api';
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

export interface GeoLocationPickerProps {
  value: string | null;
  onChange: (geoLocationId: string | null) => void;
  // geoLocationId to exclude, together with its descendants (SPEC FE04 §3.7, hallazgo E). Only
  // filters by id equality in whatever options each level actually loads — it doesn't resolve
  // the full subtree, which the backend has no recursive endpoint for.
  excludeSubtreeOf?: string;
}

interface LevelProps {
  filters: Record<string, string>;
  excludeSubtreeOf?: string;
  onFinalChange: (geoLocationId: string | null) => void;
}

// One level of the cascade. Filters propagate down: root uses `geoLevelId` (hallazgo D — the
// backend can't filter `parentGeoLocationId IS NULL`), every level below uses `parentId`. A
// `key={selected}` on the recursive child (below) makes picking a new value at this level
// discard whatever was chosen deeper — "clears, doesn't hide" (SPEC FE04 §3.7).
function GeoLocationPickerLevel({ filters, excludeSubtreeOf, onFinalChange }: LevelProps) {
  const { t } = useTranslation();
  // Controlled from the very first render — `undefined` here would make the underlying Radix
  // <Select> start uncontrolled and then switch to controlled the moment something is picked,
  // which React (rightfully) warns about.
  const [selected, setSelected] = useState('');
  const list = geoLocationResource.useList({ pageSize: 100, filters });
  // Reused from cache (staleTime 30 min): whichever screen hosts the picker already has this
  // query resolved for its own level combo/column (SPEC FE04 §3.5).
  const levelTypes = geoLevelTypeResource.useList({ pageSize: 100 });

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

  const rows = (list.data?.rows ?? []).filter((row) => row.geoLocationId !== excludeSubtreeOf);

  if (rows.length === 0) {
    // "Vacío en un nivel": no <Select> is painted, the level above stays the final selection —
    // announced for screen readers only, nothing visible (SPEC FE04 §3.7, §3.9).
    return (
      <span role="status" className="sr-only">
        {t('geoLocation.picker.emptyLevel')}
      </span>
    );
  }

  const levelName =
    levelTypes.data?.rows.find((row) => row.geoLevelTypeId === rows[0]?.geoLevelTypeId)?.name ??
    '';

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selected}
        onValueChange={(nextValue) => {
          setSelected(nextValue);
          onFinalChange(nextValue);
        }}
      >
        <SelectTrigger
          className="w-full"
          aria-label={t('geoLocation.picker.levelLabel', { level: levelName })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rows.map((row) => (
            <SelectItem key={row.geoLocationId} value={row.geoLocationId}>
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <GeoLocationPickerLevel
          key={selected}
          filters={{ parentId: selected }}
          excludeSubtreeOf={excludeSubtreeOf}
          onFinalChange={onFinalChange}
        />
      )}
    </div>
  );
}

// Cascade of <Select>, one per level, over `geoLocation` (SPEC FE04 §3.7). No autodespliegue,
// no preselection: the first level starts empty and doesn't resolve on its own.
export function GeoLocationPicker({ value, onChange, excludeSubtreeOf }: GeoLocationPickerProps) {
  const { t } = useTranslation();
  // Root level = the geoLevelType of lowest sortOrder (hallazgo D) — a suggestion about seeded
  // data, not a schema guarantee (SPEC FE04 §7 riesgo).
  const levelTypes = geoLevelTypeResource.useList({ pageSize: 100 });
  const rootLevelTypeId = useMemo(() => {
    const rows = levelTypes.data?.rows ?? [];
    if (rows.length === 0) {
      return undefined;
    }
    return rows.reduce((min, row) => (row.sortOrder < min.sortOrder ? row : min)).geoLevelTypeId;
  }, [levelTypes.data]);

  // No ancestor-chain preload on edit (SPEC FE04 §3.7, decisión confirmada): a flat read-only
  // value with a "Cambiar" button that opens the cascade empty, from the root level, whenever
  // a value already travels in on mount.
  const [editing, setEditing] = useState(value === null);
  const [resetToken, setResetToken] = useState(0);
  // Tracks the last value *this picker itself* emitted via `onChange`, so an incoming `value`
  // that doesn't match it is recognized as an external reset (e.g. a page-level "clear filters"
  // action) rather than the round-trip echo of the picker's own selection. Only an external
  // reset discards the in-progress cascade and its `editing`/`selected` state — the round-trip
  // echo must not, or picking a value would immediately collapse the cascade back to the
  // read-only view.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value === lastEmitted.current) {
      return;
    }
    lastEmitted.current = value;
    setEditing(value === null);
    setResetToken((token) => token + 1);
  }, [value]);

  function handleFinalChange(nextValue: string | null) {
    lastEmitted.current = nextValue;
    onChange(nextValue);
  }

  const existing = geoLocationResource.useOne(value ?? '');

  if (!editing && value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="text-sm text-foreground">
          {existing.isLoading ? t('common.loading') : (existing.data?.name ?? value)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          {t('geoLocation.form.changeParent')}
        </Button>
      </div>
    );
  }

  if (levelTypes.isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (levelTypes.isError || !rootLevelTypeId) {
    const message =
      levelTypes.error instanceof EsaviApiError
        ? getErrorMessage(levelTypes.error)
        : t('geoLocation.picker.loadError');
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void levelTypes.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  return (
    <GeoLocationPickerLevel
      key={resetToken}
      filters={{ geoLevelId: rootLevelTypeId }}
      excludeSubtreeOf={excludeSubtreeOf}
      onFinalChange={handleFinalChange}
    />
  );
}
