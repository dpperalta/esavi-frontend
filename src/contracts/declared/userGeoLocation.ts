import type { AppDetails } from '@/contracts/common';
import type { AssignedUser } from '@/contracts/declared/appUserRole';

// Origin: esavi-backend/src/services/appUserGeoLocation.service.ts, resolveUserCoverageService.
// The shape of ESAVI-USERGEO-008. NOT a { count, rows } response: `assigned` are the rows of
// appUserGeoLocation, `coverage` is the recursive expansion and INCLUDES the assigned nodes.
// A selector filters against `coverage`, never against `assigned` — someone with a province
// assigned can still notify at a facility in one of its cantons, which is in `coverage` alone.
export interface UserGeoCoverage {
  assigned: { geoLocationId: string; name: string; level: number }[];
  coverage: {
    geoLocationId: string;
    name: string;
    level: number;
    parentGeoLocationId: string | null;
  }[];
  count: number;
}

// A row of ESAVI-USERGEO-002A/002B: toAssignmentResponse returns the whole plain row plus the
// `geoLocation` include, listed attribute by attribute so the geometry column never travels.
// `validFrom` and `validTo` are timestamptz, NOT date (SPEC FE22 §3.3): full ISO 8601 with
// offset, unlike every date of the case file, which is YYYY-MM-DD.
export interface GeoAssignment {
  userGeoLocationId: string;
  userId: string;
  geoLocationId: string;
  validFrom: string;
  validTo: string | null;
  assignedByUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
  geoLocation: {
    geoLocationId: string;
    name: string;
    level: number;
    parentGeoLocationId: string | null;
  };
}

// 002A/002B answer `{ count, user, rows }`: the user once, not per row. `user` is the same
// USER_ATTRIBUTES projection through the same toUserResponse as ESAVI-USERROLE-002A, so it is
// `AssignedUser` and not a second declaration of the same five decrypted columns (§9).
export interface GeoAssignmentListResponse {
  count: number;
  user: AssignedUser;
  rows: GeoAssignment[];
}

// ESAVI-USERGEO-004 accepts nothing else: `userId` or `geoLocationId` in the body answer 400.
// Changing location is ESAVI-USERGEO-006.
export interface UpdateGeoValidityInput {
  validFrom?: string;
  validTo?: string | null;
}
