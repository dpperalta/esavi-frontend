// NOT a mirror: the backend builds this response as a literal — `toInvestigationResponse` drops
// `sysDetails` and the five raw foreign keys off the Sequelize instance's `toJSON()`, so there is
// no `interface` for `contracts:sync` to copy (SPEC FE13a §3.3). Reconciled by hand if the backend
// changes; `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET /api/investigations/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigation.service.ts (DETAIL_INCLUDES, DETAIL_EXCLUDE,
// toInvestigationResponse).
//
// The five raw foreign keys — `caseId`, `statusItemId`, `vaccinationSiteItemId`,
// `vaccinationHealthFacilityId`, `vaccinationGeoLocationId` — are excluded from the response and
// arrive resolved as the five objects below. The form sends ids back and never the objects
// (SPEC FE13a §3.2).
//
// The two coordinates are `numeric(10,7)` and pg returns them as strings, not numbers: the
// conversion to the `number` pair `<MapPointPicker>` speaks lives in the form mapping, in one
// place only.
export interface InvestigationDetail {
  investigationId: string;
  case: {
    caseId: string;
    caseCode: string;
    reportDate: string;
    eventDate: string | null;
  };
  status: {
    catalogItemId: string;
    code: string;
    name: string;
  } | null;
  vaccinationSite: {
    catalogItemId: string;
    code: string;
    name: string;
  } | null;
  vaccinationHealthFacility: {
    healthFacilityId: string;
    localCode: string | null;
    name: string;
  } | null;
  vaccinationGeoLocation: {
    geoLocationId: string;
    name: string;
    level: number;
  } | null;
  hospitalizationDate: string | null;
  investigationStartDate: string | null;
  vaccinationLatitude: string | null;
  vaccinationLongitude: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

// The parent every satellite of the investigation carries back, identical in the three services of
// this spec and in the ten of FE13b–FE13d: `INVESTIGATION_INCLUDE` with its nested `status` and
// `case`. Declared once here rather than copied into each satellite file — the same reason
// `AppDetails` has one home in common.ts.
export interface InvestigationParentRef {
  investigationId: string;
  isActive: boolean;
  investigationStartDate: string | null;
  status: {
    catalogItemId: string;
    code: string;
    name: string;
  } | null;
  case: {
    caseId: string;
    caseCode: string;
    eventDate: string | null;
  };
}
