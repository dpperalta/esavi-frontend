import type { DashboardGeoRow } from '@/contracts/dashboard';

export interface MappableGeoRow extends DashboardGeoRow {
  kind: 'unit';
  geoLocationId: string;
  latitude: number;
  longitude: number;
}

export function isMappable(row: DashboardGeoRow): row is MappableGeoRow {
  return (
    row.kind === 'unit' && row.geoLocationId !== null && row.latitude !== null && row.longitude !== null
  );
}

// Everything the map cannot place: `self`, `unlocated` and units without coordinates. Without the
// note, adding up the circles would not match the indicators (SPEC FE36c §6).
export function unmappedTotal(rows: DashboardGeoRow[]): number {
  return rows.filter((row) => !isMappable(row)).reduce((sum, row) => sum + row.total, 0);
}
