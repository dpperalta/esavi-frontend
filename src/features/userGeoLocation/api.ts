import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkAssignGeoLocationsInput,
  ReassignGeoLocationInput,
} from '@/contracts/appUserGeoLocation';
import type {
  GeoAssignment,
  UpdateGeoValidityInput,
  UserGeoCoverage,
} from '@/contracts/declared/userGeoLocation';
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
export const userGeoLocationResource = createResource<GeoAssignment, never, UpdateGeoValidityInput>(
  {
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
  },
);

// ESAVI-USERGEO-008 — the endpoint SPEC FE10 §3.1 declared: `CaseOpeningStep` imports it to cross
// the health-facility search against the caller's coverage. Its `staleTime` is what makes the
// whole-key invalidation of §3.4 mandatory — without it an administrator widening someone's
// coverage would not reach that user's wizard for half an hour.
export function useUserGeoCoverage(userId: string) {
  return useQuery({
    queryKey: ['userGeoLocation', 'coverage', userId],
    queryFn: async () => {
      const response = await client.get<UserGeoCoverage>(
        `user-geo-locations/user/${userId}/coverage`,
      );
      return response.data;
    },
    enabled: !!userId,
    // Configuration of who covers what — changes when an administrator changes it, not during an
    // alta (SPEC FE10 §3.4: "dos altos, el resto ninguno").
    staleTime: 30 * 60 * 1000,
  });
}

// Every write of this feature invalidates the WHOLE `['userGeoLocation']` key, never the listing
// alone (SPEC FE22 §3.4). That is what drags `['userGeoLocation', 'coverage', userId]` along —
// the query above, with its 30-minute `staleTime`, which feeds the health-facility filter of the
// FE10 wizard. It is also what the factory's own mutations already do.
const USER_GEO_LOCATION_KEY = ['userGeoLocation'];

// The toggle of §3.2 note 2 does not only change route: `002A` asks for what is in force right
// now and `002B` for everything, so the validity dimension travels as `?current=` alongside it.
export interface GeoAssignmentListParams {
  page: number;
  pageSize: number;
  coverageAll: boolean;
}

export function useGeoAssignmentsByUser(userId: string, params: GeoAssignmentListParams) {
  return userGeoLocationResource.useListByParent!(userId, {
    page: params.page,
    pageSize: params.pageSize,
    includeInactive: params.coverageAll,
    filters: { current: params.coverageAll ? 'false' : 'true' },
  });
}

// The backend's own ceiling for `limit`. Two questions of this feature need every ACTIVE row and
// not the card's page of ten — which locations the picker must exclude, and whether the row being
// closed is the last one active — because the 409 of the `007` fires on `isActive` and never
// looks at the validity (appUserGeoLocation.service.ts:471). Asked with the same parameters from
// both places on purpose: one query key, one request.
export const WHOLE_LIST_LIMIT = 100;

export function useActiveGeoAssignments(userId: string) {
  const assignments = useGeoAssignmentsByUser(userId, {
    page: 1,
    pageSize: WHOLE_LIST_LIMIT,
    coverageAll: true,
  });
  // A closed row is never excluded nor counted: the `007` reactivates that pair instead of
  // duplicating it (appUserGeoLocation.service.ts:485-497), which is the wanted behaviour (§3.5).
  return (assignments.data?.rows ?? []).filter((row) => row.isActive);
}

// ESAVI-USERGEO-004 — PUT /api/user-geo-locations/:id, validity only: `userId` or `geoLocationId`
// in the body answer 400, and a closed row answers 409 USERGEO_004_ALREADY_INACTIVE.
export function useUpdateGeoValidity() {
  return userGeoLocationResource.useUpdate();
}

// ESAVI-USERGEO-006 — PATCH /api/user-geo-locations/reassign/:id. Two rows change inside one
// transaction (appUserGeoLocation.service.ts:342): the source is closed and the target opened,
// which is why closing and re-adding by hand is not the same operation.
export function useReassignGeoLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userGeoLocationId,
      data,
    }: {
      userGeoLocationId: string;
      data: ReassignGeoLocationInput;
    }) => {
      await client.patch(`user-geo-locations/reassign/${userGeoLocationId}`, data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_GEO_LOCATION_KEY });
    },
  });
}

// ESAVI-USERGEO-007 — POST /api/user-geo-locations/bulk, all-or-nothing in one transaction, and
// it reactivates the pairs that existed closed (appUserGeoLocation.service.ts:485-497) — which is
// why a closed location is still offered in the picker. A single pair already active answers
// 409 USERGEO_007_ASSIGNMENT_EXISTS and aborts the whole batch.
export function useBulkAssignGeoLocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BulkAssignGeoLocationsInput) => {
      await client.post('user-geo-locations/bulk', input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_GEO_LOCATION_KEY });
    },
  });
}
