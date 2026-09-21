import { useEffect, useRef } from 'react';

// SPEC FE17 §3.1 — a dialog opened before another user closed the case would stay open and
// enabled, and every "Save" would end in another `*_CASE_CLOSED` 409. Fires only on the
// `false → true` transition: mounting already read-only leaves nothing to close.
export function useCloseWhenReadOnly(readOnly: boolean, close: () => void) {
  const closeRef = useRef(close);
  const wasReadOnlyRef = useRef(readOnly);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (readOnly && !wasReadOnlyRef.current) {
      closeRef.current();
    }
    wasReadOnlyRef.current = readOnly;
  }, [readOnly]);
}
