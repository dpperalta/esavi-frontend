import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SEARCH_MIN_LENGTH } from './api';

// Same value as `HealthFacilityListPage` and `GeoLocationListPage`: a third number would be one
// more thing to remember with nothing to show for it (SPEC FE20 §6).
const SEARCH_DEBOUNCE_MS = 400;

interface UserSearchFieldProps {
  // The committed term, which lives in `searchParams.q` (SPEC FE20 §3.4) — never in a store: a
  // search outside the URL survives neither a reload nor being passed as a link.
  value: string;
  // The page writes the URL, because committing a term also clears `includeInactive` (§3.5).
  onCommit: (next: string) => void;
  resultCount?: number;
  // True when the backend answered 400 USER_008_QUERY_REQUIRED: `q` tokenized to nothing, which is
  // a different thing from finding nobody and never shows as "no results" (§3.5).
  queryRequired?: boolean;
}

export function UserSearchField({
  value,
  onCommit,
  resultCount,
  queryRequired,
}: UserSearchFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  // What this field last handed to the page, so an external change of `q` — the clear button of the
  // empty state, the back button — reseeds the input without the debounce committing it straight
  // back.
  const committedRef = useRef(value);

  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Below the minimum nothing is requested and the term leaves the URL, so the table goes back
      // to the listing (§2). The 400 for a short `q` is never reached.
      const next = text.trim().length >= SEARCH_MIN_LENGTH ? text : '';
      if (next === committedRef.current) {
        return;
      }
      committedRef.current = next;
      onCommit(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Only the typed text re-arms the timer; `onCommit` is recreated on every render of the page
    // and would restart the debounce on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function handleClear() {
    setText('');
    committedRef.current = '';
    onCommit('');
  }

  const isSearching = value.trim().length >= SEARCH_MIN_LENGTH;

  return (
    <div className="flex flex-col gap-1.5 md:w-80">
      <Label htmlFor="user-search">{t('user.search.label')}</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="user-search"
            // Not `type="search"`: WebKit and Chromium paint their own clear button for it, which
            // would sit next to the labelled 44px one below and do the same thing.
            type="text"
            name="q"
            className="h-11 pl-8 md:h-8"
            value={text}
            placeholder={t('user.search.placeholder')}
            aria-describedby="user-search-hint"
            // A username or an email typed here is not dictionary text, and a password manager has
            // no business offering to fill a filter.
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {text.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            className="touch-manipulation md:size-8"
            aria-label={t('user.search.clear')}
            onClick={handleClear}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      <div id="user-search-hint" className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <p>{t('user.search.hint')}</p>
        <p>{t('user.search.usernameCaseHint')}</p>
        <p>{t('user.search.disablesInactive')}</p>
      </div>

      {queryRequired && (
        <p role="alert" className="text-xs text-destructive">
          {t('user.search.queryRequired')}
        </p>
      )}

      {/* One atomic sentence, not a bare number: without it a screen reader never learns the table
          changed while typing (SPEC FE20 §3.7). Rendered empty rather than conditionally, because a
          live region has to be in the DOM before the text arrives to be announced at all. */}
      <p role="status" aria-atomic="true" className="text-xs text-muted-foreground">
        {isSearching && resultCount !== undefined
          ? t('user.search.resultsAnnounce', { count: resultCount })
          : ''}
      </p>
    </div>
  );
}
