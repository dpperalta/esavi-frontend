import type { DashboardGeoRow } from '@/contracts/dashboard';

export interface MappableGeoRow extends DashboardGeoRow {
  kind: 'unit';
  geoLocationId: string;
  latitude: number;
  longitude: number;
}

export function isMappable(row: DashboardGeoRow): row is MappableGeoRow {
  return (
    row.kind === 'unit' &&
    row.geoLocationId !== null &&
    row.latitude !== null &&
    row.longitude !== null
  );
}

const MIN_RADIUS = 4;
const RADIUS_RANGE = 24;

// Area, not radius, is proportional to the total: the eye compares areas (SPEC FE36c §6).
export function circleRadius(total: number, maxTotal: number): number {
  return MIN_RADIUS + RADIUS_RANGE * Math.sqrt(total / maxTotal);
}

// Everything the map cannot place: `self`, `unlocated` and units without coordinates. Without the
// note, adding up the circles would not match the indicators (SPEC FE36c §6).
export function unmappedTotal(rows: DashboardGeoRow[]): number {
  return rows.filter((row) => !isMappable(row)).reduce((sum, row) => sum + row.total, 0);
}
