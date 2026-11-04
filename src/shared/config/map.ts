export interface MapLatLng {
  lat: number;
  lng: number;
}

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Last resort when no env center resolves — never the browser's geolocation (SPEC FE13a §3.7).
export const ABSOLUTE_FALLBACK_CENTER: MapLatLng = { lat: 0, lng: 0 };

// Required verbatim by OpenStreetMap's usage policy. It is a third party's legal notice, not
// interface text, so it does not go through i18n (SPEC FE13a §3.7, SPEC FE36c §3.8).
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_MAX_ZOOM = 19;

// Warn once per page session, not once per map: a form with several maps (or a page with a
// picker and the dashboard map) must not repeat the same warning.
let warnedMissingTileUrl = false;
let warnedMissingDefaultCenter = false;

export function resolveTileUrl(): string {
  const raw = import.meta.env.VITE_MAP_TILE_URL as string | undefined;
  if (raw) {
    return raw;
  }
  if (!warnedMissingTileUrl) {
    warnedMissingTileUrl = true;
    console.warn('VITE_MAP_TILE_URL is not defined — maps fall back to the public OpenStreetMap server.');
  }
  return DEFAULT_TILE_URL;
}

export function parseLatLng(raw: string | undefined): MapLatLng | null {
  if (!raw) {
    return null;
  }
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { lat: parts[0], lng: parts[1] };
}

export function resolveDefaultMapCenter(): MapLatLng | null {
  const parsed = parseLatLng(import.meta.env.VITE_MAP_DEFAULT_CENTER as string | undefined);
  if (!parsed && !warnedMissingDefaultCenter) {
    warnedMissingDefaultCenter = true;
    console.warn('VITE_MAP_DEFAULT_CENTER is not defined or not valid — maps fall back to (0, 0).');
  }
  return parsed;
}
