import { TermSearchField, type TermSearchFieldProps } from '@/shared/components/TermSearchField';

// `ESAVI-MEDDRA-006`'s numbers (SPEC FE12b §3.2, §4 paso 5): 3 characters minimum, 400 ms debounce
// — the licensed dictionary behind it caches 5 minutes per term and language and carries a
// 60-requests-per-15-minutes limiter, so the field cannot fire on every keystroke of a 2-letter
// query. FE12d reuses this same wrapper for the complications of pregnancy without rewriting it
// (CONVENTIONS.md §10.4).
export function MeddraSearchField(props: Omit<TermSearchFieldProps, 'minLength' | 'debounceMs'>) {
  return <TermSearchField {...props} minLength={3} debounceMs={400} />;
}
