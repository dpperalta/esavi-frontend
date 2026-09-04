import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from 'lucide-react';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';

const SEARCH_DEBOUNCE_MS = 400;
const DEFAULT_MIN_LENGTH = 2;

export interface EntitySearchOption {
  id: string;
  label: string;
  // An option that exists but the `POST` this selector feeds would reject — out of geographic
  // coverage, out of scope, etc. It stays in the list, deshabilitada y con su razón visible,
  // never hidden: hiding it reproduces the exact "no encontrada" confusion the reason avoids.
  disabled?: boolean;
  disabledReason?: string;
}

export interface EntitySearchSelectProps {
  value: string | null;
  // Label of `value`, supplied by whoever consumes this primitive — from the option just picked,
  // from an entity already resolved in cache (reentry), or `undefined` while that resolution is
  // still loading. This primitive never fetches it on its own: it doesn't know which entity it is
  // searching, only the options it's handed.
  resolvedLabel?: string | null;
  onChange: (option: EntitySearchOption | null) => void;
  // The debounced, trimmed search term. Called with '' below `minLength`, so the caller's own
  // resource hook — the thing that actually knows the entity and the endpoint — never fires a
  // request for a term too short to mean anything.
  onQueryChange: (query: string) => void;
  options: EntitySearchOption[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  minLength?: number;
  placeholder: string;
  ariaLabel: string;
  changeLabel: string;
  emptyMessage: string;
  disabled?: boolean;
}

// The primitive of ARCHITECTURE.md §4.3: a debounced text search resolved in a popover, with a
// selection that collapses to a read-only chip and a "Cambiar" button — same shape the ad-hoc
// stand-ins of FE09 (`EsaviCaseFilters.tsx`) and FE04 (`GeoLocationPicker`) already settled on.
// It is deliberately blind to which entity it searches: the caller owns the resource hook and
// hands back `options`: this component only ever renders what it's given.
export function EntitySearchSelect({
  value,
  resolvedLabel,
  onChange,
  onQueryChange,
  options,
  isLoading,
  isError,
  error,
  onRetry,
  minLength = DEFAULT_MIN_LENGTH,
  placeholder,
  ariaLabel,
  changeLabel,
  emptyMessage,
  disabled,
}: EntitySearchSelectProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(value === null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  // Tracks the last value this component itself emitted, so an external reset (the caller
  // clearing `value` on its own) is told apart from the round-trip echo of a selection just made
  // here — the same technique GeoLocationPicker uses, and for the same reason: the echo must not
  // re-open the search that just resolved it.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) {
      return;
    }
    lastEmitted.current = value;
    setEditing(value === null);
  }, [value]);

  useEffect(() => {
    const trimmed = draft.trim();
    const handle = window.setTimeout(() => {
      onQueryChange(trimmed.length >= minLength ? trimmed : '');
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on `draft` only, same reasoning as EsaviCaseFilters' useDebouncedWriter.
  }, [draft]);

  function handleSelect(option: EntitySearchOption) {
    if (option.disabled) {
      return;
    }
    lastEmitted.current = option.id;
    setEditing(false);
    setOpen(false);
    setDraft('');
    onChange(option);
  }

  function handleClear() {
    lastEmitted.current = null;
    setEditing(true);
    setDraft('');
    onChange(null);
  }

  if (!editing && value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="text-sm text-foreground">
          {resolvedLabel === undefined ? t('common.loading') : (resolvedLabel ?? value)}
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setEditing(true)}>
            {changeLabel}
          </Button>
          <button
            type="button"
            aria-label={t('common.select.clear')}
            disabled={disabled}
            className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={handleClear}
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const showResults = draft.trim().length >= minLength;

  return (
    <Popover open={open && showResults} onOpenChange={setOpen}>
      {/* `label` (not just `aria-label` on the input below) — cmdk wires its own hidden
          `cmdk-label` and points `aria-labelledby` at it, which wins over `aria-label` per the
          accessible-name computation; leaving `label` unset renders that hidden element empty
          and silently erases the name a screen reader announces. */}
      <Command shouldFilter={false} label={ariaLabel} className="overflow-visible bg-transparent p-0">
        <PopoverTrigger asChild>
          <div>
            <CommandInput
              value={draft}
              onValueChange={setDraft}
              placeholder={placeholder}
              aria-label={ariaLabel}
              disabled={disabled}
              onFocus={() => setOpen(true)}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <CommandList>
            {isLoading && (
              <div className="p-2">
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {!isLoading && isError && (
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="text-sm text-destructive">
                  {error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected')}
                </p>
                {onRetry && (
                  <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    {t('common.table.retry')}
                  </Button>
                )}
              </div>
            )}
            {!isLoading && !isError && options.length === 0 && <CommandEmpty>{emptyMessage}</CommandEmpty>}
            {!isLoading && !isError && options.length > 0 && (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    disabled={option.disabled}
                    aria-disabled={option.disabled}
                    onSelect={() => handleSelect(option)}
                  >
                    <span className="flex-1">{option.label}</span>
                    {option.disabled && option.disabledReason && (
                      <span className="text-xs text-muted-foreground">{option.disabledReason}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
