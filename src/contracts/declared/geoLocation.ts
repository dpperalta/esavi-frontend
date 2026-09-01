// NOT a mirror: the backend never exports the row as a type, it lives on the Sequelize model
// (SPEC FE04 §3.4). Reconciled by hand if the model changes; `contracts:sync` never writes into
// this folder.
// Origin: esavi-backend/src/models/geoLocation.model.ts
// ESAVI-GEOLOC-002 (list) never includes geoLevelType/parent/children — only ESAVI-GEOLOC-003
// (detail) does. The list row's geoLevelTypeId is a bare FK.
import type { AppDetails } from '@/contracts/common';

export interface GeoLocation {
  geoLocationId: string;
  geoLevelTypeId: string | null;
  parentGeoLocationId: string | null;
  name: string;
  officialName: string | null;
  shortName: string | null;
  isoCode: string | null;
  externalCode: string;
  level: number;
  latitude: number | null;
  longitude: number | null;
  sortOrder: number | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// Shape of ESAVI-GEOLOC-003's response — the only read that includes relations.
export interface GeoLocationDetail extends GeoLocation {
  geoLevelType: { geoLevelTypeId: string; code: string; name: string } | null;
  parent: { geoLocationId: string; name: string; level: number; externalCode: string } | null;
  children: { geoLocationId: string; name: string; level: number; externalCode: string }[];
}
