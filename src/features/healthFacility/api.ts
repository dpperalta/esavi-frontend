import { useQuery } from '@tanstack/react-query';
import type { CreateHealthFacilityInput } from '@/contracts/healthFacility';
import type { HealthFacility, HealthFacilitySearchRow } from '@/contracts/declared/healthFacility';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// POST   /api/health-facilities                    ESAVI-HFAC-001   ADMIN       create
// GET    /api/health-facilities/location/:id       ESAVI-HFAC-002A  USER        active by location
// GET    /api/health-facilities/admin/location/:id ESAVI-HFAC-002B  ADMIN       by location, incl. inactive
// GET    /api/health-facilities/search             ESAVI-HFAC-006   USER        search by name or code
// GET    /api/health-facilities/:id                ESAVI-HFAC-003   USER        detail
// PUT    /api/health-facilities/:id                ESAVI-HFAC-004   ADMIN       update
// DELETE /api/health-facilities/:id                ESAVI-HFAC-005A  ADMIN       deactivate
// PATCH  /api/health-facilities/activate/:id       ESAVI-HFAC-005B  SUPERADMIN  activate
//
// No flat `GET /api/health-facilities` in the inventory (SPEC FE06 §1 hallazgo A): `useList` is
// never invoked here, only `useListByParent` and `useHealthFacilitySearch` (§3.3).
export const healthFacilityResource = createResource<
  HealthFacility,
  CreateHealthFacilityInput,
  Partial<CreateHealthFacilityInput>
>({
  key: 'healthFacility',
  path: 'health-facilities',
  idField: 'healthFacilityId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` with `inactiveMode: 'adminPath'`, even though this entity never
  // calls `useList` — there's no flat listing (hallazgo A). Same case as `catalogItem`.
  adminPath: 'health-facilities/admin',
  parent: {
    operation: 'byLocation',
    segment: 'location/:parentId',
    adminSegment: 'admin/location/:parentId',
  },
  staleTime: 30 * 60 * 1000,
});

export interface HealthFacilitySearchParams {
  q: string;
  geoLocationId?: string;
  page?: number;
  pageSize: number;
}

// ESAVI-HFAC-006 — search by name or code. `q` travels as both `name` and `code`, and the
// backend unions the four columns (name/officialName/shortName/localCode) with OR (SPEC FE06
// §3.3). `createResource` has no notion of a search route — `useList` always hits `config.path`
// — so this hook lives beside the resource declaration instead of inside the factory.
export function useHealthFacilitySearch(params: HealthFacilitySearchParams) {
  const { q, geoLocationId, page, pageSize } = params;
  const trimmed = q.trim();
  const limit = pageSize;
  const offset = ((page ?? 1) - 1) * pageSize;

  return useQuery({
    queryKey: [
      'healthFacility',
      'search',
      { name: trimmed, code: trimmed, geoLocationId, limit, offset },
    ],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<HealthFacilitySearchRow>>(
        'health-facilities/search',
        { params: { name: trimmed, code: trimmed, geoLocationId, limit, offset } },
      );
      return response.data;
    },
    // Below the validator's two-character minimum the backend answers 400 — the hook never
    // fires, so that response never reaches the user (SPEC FE06 §3.3).
    enabled: trimmed.length >= 2,
    staleTime: 30 * 60 * 1000,
  });
}
