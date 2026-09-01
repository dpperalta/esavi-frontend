import type { CreateGeoLevelTypeInput } from '@/contracts/geoLevelType';
import type { GeoLevelType } from '@/contracts/declared/geoLevelType';
import { createResource } from '@/shared/api/createResource';

// GET    /api/geo-level-types              ESAVI-GEOLVL-002   USER        list
// GET    /api/geo-level-types/:id          ESAVI-GEOLVL-003   USER        detail
// POST   /api/geo-level-types              ESAVI-GEOLVL-001   ADMIN       create
// PUT    /api/geo-level-types/:id          ESAVI-GEOLVL-004   ADMIN       update
// DELETE /api/geo-level-types/:id          ESAVI-GEOLVL-005A  ADMIN       deactivate
// PATCH  /api/geo-level-types/activate/:id ESAVI-GEOLVL-005B  SUPERADMIN  activate
//
// Single-route entity (SPEC FE04 §1 hallazgo B), same `serverDecides` pattern as `catalogType`
// — no `002A`/`002B`, no `adminPath`, no inactive toggle.
export const geoLevelTypeResource = createResource<
  GeoLevelType,
  CreateGeoLevelTypeInput,
  Partial<CreateGeoLevelTypeInput>
>({
  key: 'geoLevelType',
  path: 'geo-level-types',
  idField: 'geoLevelTypeId',
  inactiveMode: 'serverDecides',
  // Catalog-like data, rarely changes (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});
