import { geoLocationResource } from '@/features/geoLocation/api';
import { patientResource } from '@/features/patient/api';

// SPEC FE13e §3.7 — the preload for section G's `<MapPointPicker>` marker, chaining
// ESAVI-PATIENT-003 and ESAVI-GEOLOC-003 through `patientResource.useOne`/`geoLocationResource.useOne`
// (CONVENTIONS.md §5: no hand-written GET duplicates an existing `createResource` declaration).
// Reusing those hooks keeps the query keys exactly as declared in §3.4 —
// `['patient', 'detail', patientId]` and `['geoLocation', 'detail', geoLocationId]` — so this read
// shares the cache with any other screen that already opened the same patient or division.
//
// THREE SILENT FALLS, ALL RESOLVING TO `null` (§3.7): the patient has no `residence`, the division
// has no `latitude` or `longitude`, or either read fails. In every case the map opens at
// `VITE_MAP_DEFAULT_CENTER` with no error shown — the preload is a convenience, not a requirement,
// and a red toast for failing to center a map would be noise.
export function usePatientResidenceCenter(
  patientId: string | undefined,
): { lat: number; lng: number } | null {
  const patientQuery = patientResource.useOne(patientId ?? '');

  // `residence` is nullable on the patient itself — the first of the three falls, and the most
  // common one: most patients simply have no registered residence yet.
  const geoLocationId = patientQuery.data?.residence?.geoLocationId;

  // `useOne` already carries `enabled: !!id` (`createResource.ts`), so this only fires once the
  // patient read has resolved a real id — the "enabled sólo con el id resuelto" of §3.7.
  const geoLocationQuery = geoLocationResource.useOne(geoLocationId ?? '');

  if (patientQuery.isError || geoLocationQuery.isError) return null;
  if (!geoLocationId) return null;

  const latitude = geoLocationQuery.data?.latitude;
  const longitude = geoLocationQuery.data?.longitude;
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }

  // A division is an administrative boundary, not a house: what this hook hands back is a
  // centroide, never a home. The caller (`CommunitySection`) is the one that marks the resulting
  // marker as approximate — this hook only ever answers with a point or with `null`.
  return { lat: latitude, lng: longitude };
}
