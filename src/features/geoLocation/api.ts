import type { CreateGeoLocationInput } from '@/contracts/geoLocation';
import type { GeoLocation } from '@/contracts/declared/geoLocation';
import { createResource } from '@/shared/api/createResource';

// GET    /api/geo-locations              ESAVI-GEOLOC-002   USER        list (filters:
//                                                                        geoLevelId/parentId/name/code)
// GET    /api/geo-locations/:id          ESAVI-GEOLOC-003   USER        detail (includes
//                                                                        geoLevelType, parent, children)
// POST   /api/geo-locations              ESAVI-GEOLOC-001   ADMIN       create
// PUT    /api/geo-locations/:id          ESAVI-GEOLOC-004   ADMIN       update
// DELETE /api/geo-locations/:id          ESAVI-GEOLOC-005A  ADMIN       deactivate
// PATCH  /api/geo-locations/activate/:id ESAVI-GEOLOC-005B  SUPERADMIN  activate
//
// Single-route entity (SPEC FE04 §1 hallazgo B), same `serverDecides` pattern as `catalogType`
// — no `002A`/`002B`, no `adminPath`, no inactive toggle.
export const geoLocationResource = createResource<
  GeoLocation,
  CreateGeoLocationInput,
  Partial<CreateGeoLocationInput>
>({
  key: 'geoLocation',
  path: 'geo-locations',
  idField: 'geoLocationId',
  inactiveMode: 'serverDecides',
  // Catalog-like data, rarely changes (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});
