// Origin: esavi-backend/src/services/appUserGeoLocation.service.ts, resolveUserCoverageService.
// The shape of ESAVI-USERGEO-008. NOT a { count, rows } response: `assigned` are the rows of
// appUserGeoLocation, `coverage` is the recursive expansion and INCLUDES the assigned nodes.
// A selector filters against `coverage`, never against `assigned` — someone with a province
// assigned can still notify at a facility in one of its cantons, which is in `coverage` alone.
export interface UserGeoCoverage {
  assigned: { geoLocationId: string; name: string; level: number }[];
  coverage: { geoLocationId: string; name: string; level: number; parentGeoLocationId: string | null }[];
  count: number;
}
