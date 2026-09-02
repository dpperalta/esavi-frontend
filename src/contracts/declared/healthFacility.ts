// Origin: esavi-backend/src/models/healthFacility.model.ts
// ESAVI-HFAC-002A/002B return this shape with no relations at all and without excluding
// sysDetails (finding D). sysDetails is deliberately not declared: the client never reads it.
// latitude/longitude are DECIMAL(10,7) and pg hands them back as strings (finding I).
import type { AppDetails } from '@/contracts/common';

export interface HealthFacility {
  healthFacilityId: string;
  geoLocationId: string | null;
  facilityTypeItemId: string | null;
  parentHealthFacilityId: string | null;
  localCode: string | null;
  name: string;
  officialName: string | null;
  shortName: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// Shape of ESAVI-HFAC-006's rows — the search includes two relations the listing never has.
export interface HealthFacilitySearchRow extends HealthFacility {
  geoLocation: { geoLocationId: string; name: string } | null;
  facilityType: { catalogItemId: string; name: string } | null;
}

// Shape of ESAVI-HFAC-003 — the only read that includes the hierarchy.
export interface HealthFacilityDetail extends HealthFacility {
  geoLocation: { geoLocationId: string; name: string; level: number } | null;
  facilityType: { catalogItemId: string; code: string; name: string } | null;
  parent: { healthFacilityId: string; name: string; localCode: string | null } | null;
  children: { healthFacilityId: string; name: string; localCode: string | null; isActive: boolean }[];
}
