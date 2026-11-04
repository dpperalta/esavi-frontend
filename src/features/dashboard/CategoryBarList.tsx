export interface CategoryBarRow {
  key: string;
  label: string;
  value: number | null;
  display: string;
}

interface CategoryBarListProps {
  rows: CategoryBarRow[];
  labelledBy?: string;
}

// One row per category with its value in text; the bar is decorative and scaled to the largest
// value of its own list, or to 1 when every value is a ratio (SPEC FE35 §3.7, FE36b §3.7).
export function CategoryBarList({ rows, labelledBy }: CategoryBarListProps) {
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));

  return (
    <ul aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-foreground">{row.label}</span>
            <span className="shrink-0 text-foreground tabular-nums">{row.display}</span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-primary"
              // Inline because the width is data, not a class Tailwind can generate ahead of time.
              style={{ width: `${((row.value ?? 0) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
