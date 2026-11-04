import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const TABLE_VIEW = 'table';

// The only reader and writer of a dashboard chart's view param (SPEC FE36a §3.4). It touches its
// own key alone, so switching view keeps the period, and the period bar never clears it. Any value
// other than `table` reads as the chart, with no notice: it is presentation, not data.
export function useChartViewParam(key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isTable = searchParams.get(key) === TABLE_VIEW;

  const toggle = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get(key) === TABLE_VIEW) next.delete(key);
      else next.set(key, TABLE_VIEW);
      return next;
    });
  }, [key, setSearchParams]);

  return { isTable, toggle };
}
