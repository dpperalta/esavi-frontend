import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEBOUNCE_MS = 400;

const identity = (value: string) => value;

export interface DebouncedSearchParamOptions {
  // Turns the buffer into what the URL may hold — an empty string removes the parameter. Used for
  // trimming and for minimum lengths, so the URL never holds a filter the list is not applying.
  normalize?: (value: string) => string;
  // Writes with `replace` instead of pushing a history entry.
  replace?: boolean;
  // Clears `page` along with the write. On by default: a new filter starts from the first page.
  resetPage?: boolean;
}

// A typing buffer for a text filter that lives in `searchParams`: the input is local, and the URL
// is written once the user stops typing. When the parameter changes from outside — the
// clear-filters button, back/forward — the buffer follows it, unless it already normalizes to
// the new value.
//
// The timer reads the URL through a ref, not through the functional form of `setSearchParams`:
// React Router hands that updater the `searchParams` of the render the callback was created in,
// not the live URL. The timer is scheduled on the render where the buffer changed, so the
// functional form replayed that URL and undid any other filter changed inside the debounce
// window — the toggle of DiagnosticTermListPage flipped back 400ms after mount. And when the
// value already matches, nothing is written: returning the unchanged params still navigated.
export function useDebouncedSearchParam(key: string, options: DebouncedSearchParamOptions = {}) {
  const { normalize = identity, replace = false, resetPage = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlValue = searchParams.get(key) ?? '';
  const [buffer, setBuffer] = useState(urlValue);
  const latest = useRef({ searchParams, setSearchParams, normalize, replace, resetPage });

  useEffect(() => {
    latest.current = { searchParams, setSearchParams, normalize, replace, resetPage };
  });

  useEffect(() => {
    setBuffer((current) => (latest.current.normalize(current) === urlValue ? current : urlValue));
  }, [urlValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const { searchParams: current, setSearchParams: write, ...config } = latest.current;
      const value = config.normalize(buffer);
      if (value === (current.get(key) ?? '')) {
        return;
      }
      const next = new URLSearchParams(current);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (config.resetPage) {
        next.delete('page');
      }
      write(next, { replace: config.replace });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [key, buffer]);

  return [buffer, setBuffer] as const;
}
