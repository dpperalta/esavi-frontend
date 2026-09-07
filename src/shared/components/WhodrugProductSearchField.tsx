import { TermSearchField, type TermSearchFieldProps } from '@/shared/components/TermSearchField';

// `ESAVI-WHODPROD-006`'s numbers (SPEC FE12b §3.2, §4 paso 5): 3 characters minimum, 300 ms
// debounce — faster than MedDRA's on purpose, because this is a query against a local mirror with
// no rate limiter behind it, not a licensed API. The caller requests `limit: 20` from the hook and
// compares `count === limit` itself to derive `moreResultsAvailable`; this wrapper only fixes the
// timing, the same way `<MeddraSearchField>` does.
export function WhodrugProductSearchField(props: Omit<TermSearchFieldProps, 'minLength' | 'debounceMs'>) {
  return <TermSearchField {...props} minLength={3} debounceMs={300} />;
}
