import { useQuery } from '@tanstack/react-query';
import type { GeoAssignment, UpdateGeoValidityInput, UserGeoCoverage } from '@/contracts/declared/userGeoLocation';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// GET    /api/user-geo-locations/user/:id            ESAVI-USERGEO-002A  USER        current and active
// GET    /api/user-geo-locations/admin/user/:id      ESAVI-USERGEO-002B  ADMIN       includes closed and expired
// PUT    /api/user-geo-locations/:id                 ESAVI-USERGEO-004   ADMIN       edit validity only
// DELETE /api/user-geo-locations/:id                 ESAVI-USERGEO-005A  ADMIN       close (writes validTo = now())
// PATCH  /api/user-geo-locations/activate/:id        ESAVI-USERGEO-005B  SUPERADMIN  reopen
//
// The factory's `useCreate` and `useOne` are deliberately left unused: SPEC FE22 §3.2 consumes
// neither ESAVI-USERGEO-001 (the bulk 007 covers one location and many with one transaction)
// nor ESAVI-USERGEO-003 (the listing already carries the whole row).
export const userGeoLocationResource = createResource<GeoAssignment, never, UpdateGeoValidityInput>({
  key: 'userGeoLocation',
  path: 'user-geo-locations',
  idField: 'userGeoLocationId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` whenever `inactiveMode` is `'adminPath'`, though this entity is
  // only ever listed by parent: there is no flat `GET /api/user-geo-locations` in the inventory.
  adminPath: 'user-geo-locations/admin',
  parent: {
    operation: 'byUser',
    segment: 'user/:parentId',
    adminSegment: 'admin/user/:parentId',
  },
});

// ESAVI-USERGEO-008 — the endpoint SPEC FE10 §3.1 declared: `CaseOpeningStep` imports it to cross
// the health-facility search against the caller's coverage. Its `staleTime` is what makes the
// whole-key invalidation of §3.4 mandatory — without it an administrator widening someone's
// coverage would not reach that user's wizard for half an hour.
export function useUserGeoCoverage(userId: string) {
  return useQuery({
    queryKey: ['userGeoLocation', 'coverage', userId],
    queryFn: async () => {
      const response = await client.get<UserGeoCoverage>(`user-geo-locations/user/${userId}/coverage`);
      return response.data;
    },
    enabled: !!userId,
    // Configuration of who covers what — changes when an administrator changes it, not during an
    // alta (SPEC FE10 §3.4: "dos altos, el resto ninguno").
    staleTime: 30 * 60 * 1000,
  });
}
