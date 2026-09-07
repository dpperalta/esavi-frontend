import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';

export interface TermSearchOption {
  code: string;
  name: string;
}

export interface TermSearchFieldProps {
  // The typed name — always the field's real value, never a chip that collapses on selection
  // (SPEC FE12b §3.5: "el usuario ve una caja de texto ..., no un selector de taxonomía").
  value: string;
  onValueChange: (name: string) => void;
  onSelect: (option: TermSearchOption) => void;
  // Debounced and trimmed, called with '' below `minLength` — same contract as
  // `<EntitySearchSelect>`'s `onQueryChange`, so the caller's resource hook never fires a request
  // for a term too short to mean anything.
  onQueryChange: (term: string) => void;
  options: TermSearchOption[];
  isLoading?: boolean;
  isError?: boolean;
  // `count === limit` on the caller's last response: there were more rows than fit, and there is
  // no pagination — the user has to narrow the term (SPEC FE12b §3.2).
  moreResultsAvailable?: boolean;
  minLength: number;
  debounceMs: number;
  placeholder: string;
  ariaLabel: string;
  // Overrides for the two envolturas' service-specific wording (SPEC FE12b §3.6); the generic
  // `common.termSearch.*` copy below is what a caller that doesn't need to differ gets for free.
  noResultsMessage?: string;
  serviceUnavailableMessage?: string;
  // A value that arrived from a master is read-only, not disabled (SPEC FE12b §3.7): a screen
  // reader still reads it, and it stays in the tab order right before the "quitar" action `onClear`
  // renders next to it.
  readOnly?: boolean;
  onClear?: () => void;
  disabled?: boolean;
  id?: string;
}

// Bolds the matched substring inside a suggestion's name — the "resaltado de la coincidencia" of
// SPEC FE12b §4 paso 5. Case-insensitive, first match only: these rows are short names, not prose
// where a term could legitimately repeat with different meaning.
function highlightMatch(name: string, term: string): ReactNode {
  const index = term ? name.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index === -1) {
    return name;
  }
  return (
    <>
      {name.slice(0, index)}
      <mark className="rounded-sm bg-primary/20 text-inherit">{name.slice(index, index + term.length)}</mark>
      {name.slice(index + term.length)}
    </>
  );
}

// The primitive of ARCHITECTURE.md §4.3 and SPEC FE12b §2: a debounced combobox against a
// clinical or pharmaceutical master, degrading to free text on a service error instead of
// blocking the field. Parameterized by hook-owned data (`options`/`isLoading`/`isError`, fed by
// the caller exactly like `<EntitySearchSelect>`) so this component never learns which master it
// searches. `<MeddraSearchField>` and `<WhodrugProductSearchField>` only fix `minLength` and
// `debounceMs`.
export function TermSearchField({
  value,
  onValueChange,
  onSelect,
  onQueryChange,
  options,
  isLoading = false,
  isError = false,
  moreResultsAvailable = false,
  minLength,
  debounceMs,
  placeholder,
  ariaLabel,
  noResultsMessage,
  serviceUnavailableMessage,
  readOnly = false,
  onClear,
  disabled = false,
  id,
}: TermSearchFieldProps) {
  const { t } = useTranslation();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const trimmed = value.trim();
  const meetsMinLength = trimmed.length >= minLength;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      onQueryChange(meetsMinLength ? trimmed : '');
    }, debounceMs);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on `value` only, same reasoning as EntitySearchSelect's debounce effect.
  }, [value]);

  useEffect(() => {
    setHighlighted(-1);
  }, [options]);

  const showPanel = open && !readOnly && trimmed.length > 0;

  function selectOption(option: TermSearchOption) {
    onSelect(option);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showPanel || !meetsMinLength) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => Math.min(prev + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      if (highlighted >= 0 && highlighted < options.length) {
        event.preventDefault();
        selectOption(options[highlighted]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeOptionId =
    meetsMinLength && highlighted >= 0 && options[highlighted]
      ? `${listboxId}-option-${highlighted}`
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Popover open={showPanel} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="flex-1">
              <Input
                id={id}
                role="combobox"
                aria-expanded={showPanel}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                aria-label={ariaLabel}
                readOnly={readOnly}
                disabled={disabled}
                placeholder={placeholder}
                value={value}
                onChange={(event) => {
                  onValueChange(event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="w-[var(--radix-popover-trigger-width)] p-1"
          >
            <div id={listboxId} role="listbox" aria-label={ariaLabel}>
              {!meetsMinLength && (
                <p className="p-2 text-sm text-muted-foreground">
                  {t('common.termSearch.minChars', { count: minLength })}
                </p>
              )}
              {meetsMinLength && isLoading && (
                <div className="flex flex-col gap-1 p-1">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
              {meetsMinLength && !isLoading && isError && (
                <p className="p-2 text-sm text-muted-foreground">
                  {serviceUnavailableMessage ?? t('common.termSearch.serviceUnavailable')}
                </p>
              )}
              {meetsMinLength && !isLoading && !isError && options.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  {noResultsMessage ?? t('common.termSearch.noResults')}
                </p>
              )}
              {meetsMinLength && !isLoading && !isError && options.length > 0 && (
                <ul className="flex flex-col">
                  {options.map((option, index) => (
                    <li
                      key={option.code}
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      // The `<mark>` around the matched substring splits the name into separate
                      // text nodes, and the accessible-name algorithm inserts a space between
                      // them — "Fie" + "bre alta" reads as "Fie bre alta" to a query or a screen
                      // reader. The explicit `aria-label` is what keeps the highlight visual-only.
                      aria-label={option.name}
                      aria-selected={index === highlighted}
                      className={cn(
                        'cursor-pointer rounded-md px-2 py-1.5 text-sm',
                        index === highlighted && 'bg-accent text-accent-foreground',
                      )}
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectOption(option)}
                    >
                      {highlightMatch(option.name, trimmed)}
                    </li>
                  ))}
                </ul>
              )}
              {meetsMinLength && !isLoading && !isError && moreResultsAvailable && (
                <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">
                  {t('common.termSearch.moreResults')}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {readOnly && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.termSearch.clear')}
            disabled={disabled}
            onClick={onClear}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>
      {/* A dropdown that appears in silence does not exist for a screen reader (SPEC FE12b §3.7). */}
      <span className="sr-only" aria-live="polite">
        {meetsMinLength &&
          !isLoading &&
          !isError &&
          t('common.termSearch.resultsAnnounce', { count: options.length })}
      </span>
    </div>
  );
}
