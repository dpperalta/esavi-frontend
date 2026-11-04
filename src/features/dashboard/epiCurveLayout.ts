export const Y_AXIS_WIDTH = 32;
// Recharts leaves 10 % of each category as gap, so 5 px per week keeps every bar at ≥ 4 px; below
// that the chart keeps its width and the card scrolls instead (SPEC FE36a §3.7).
const MIN_WEEK_WIDTH = 5;

// SPEC FE36a §3.7, with the below-md rule taking precedence at any number of weeks: a label is
// ~60 px wide and 375 px fits about six.
export function labelStep(weekCount: number, isMobile: boolean): number {
  if (isMobile) return 8;
  return weekCount > 26 ? 4 : 1;
}

export function chartMinWidth(weekCount: number): number {
  return weekCount * MIN_WEEK_WIDTH + Y_AXIS_WIDTH;
}
