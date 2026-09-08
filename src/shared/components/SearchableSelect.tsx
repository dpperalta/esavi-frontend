import { useState } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  // Trailing, muted-foreground hint next to the label — `<WhodrugTreePicker>` uses it for the
  // `matchCount` of each level's option (ARCHITECTURE.md §4.3, SPEC FE12c §3.2).
  description?: string;
}

export interface SearchableSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  // Fully controlled: the caller owns this text, because a consumer like `<WhodrugTreePicker>`
  // folds it into its own TanStack Query key (SPEC FE12c §3.4) — this primitive never keeps its
  // own copy of what's typed.
  search: string;
  onSearchChange: (search: string) => void;
  options: SearchableSelectOption[];
  isLoading?: boolean;
  // Below this length the options list isn't mounted at all — the reason the primitive exists for
  // a "catálogo largo" (ARCHITECTURE.md §4.3): a long dictionary render- or fetches nothing until
  // the user narrows it. `0` (default) means no minimum — always show whatever `options` carries.
  minLength?: number;
  placeholder: string;
  ariaLabel: string;
  emptyMessage: string;
  // Required whenever `minLength > 0`; unused otherwise. Left to the caller instead of an internal
  // `t()` call so this primitive introduces no i18n key of its own (CONVENTIONS.md §2).
  minLengthMessage?: string;
  // The label of `value` when it isn't present in the current `options` — e.g. a level whose
  // options were narrowed by a later search and no longer include the one already chosen. Falls
  // back to looking `value` up in `options` when omitted.
  selectedLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function SearchableSelect({
  value,
  onChange,
  search,
  onSearchChange,
  options,
  isLoading = false,
  minLength = 0,
  placeholder,
  ariaLabel,
  emptyMessage,
  minLengthMessage,
  selectedLabel,
  disabled = false,
  disabledReason,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const meetsMinLength = search.trim().length >= minLength;
  const displayLabel = selectedLabel ?? options.find((option) => option.value === value)?.label ?? null;

  if (disabled) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={false}
          aria-label={ariaLabel}
          disabled
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-muted-foreground">{placeholder}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
        {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      </div>
    );
  }

  function handleSelect(option: SearchableSelectOption) {
    onChange(option.value === value ? null : option.value);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !displayLabel && 'text-muted-foreground')}>
            {displayLabel ?? placeholder}
          </span>
          <ChevronsUpDownIcon aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false} label={ariaLabel}>
          <CommandInput value={search} onValueChange={onSearchChange} placeholder={placeholder} aria-label={ariaLabel} />
          <CommandList>
            {!meetsMinLength && <p className="p-2 text-sm text-muted-foreground">{minLengthMessage}</p>}
            {meetsMinLength && isLoading && (
              <div className="flex flex-col gap-1 p-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {meetsMinLength && !isLoading && options.length === 0 && <CommandEmpty>{emptyMessage}</CommandEmpty>}
            {meetsMinLength && !isLoading && options.length > 0 && (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    // Without this, the accessible name concatenates the label and the trailing
                    // description (e.g. "BrandA 3 coincidencias") — a screen reader or a test
                    // querying by the plain label would fail to match, the same reasoning
                    // TermSearchField's `<mark>` needs its own explicit `aria-label` for.
                    aria-label={option.label}
                    onSelect={() => handleSelect(option)}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
