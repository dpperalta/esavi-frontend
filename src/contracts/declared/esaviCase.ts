// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE08 §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET /api/esavi-cases/:id (ESAVI-CASE-003) — origin:
// esavi-backend/src/services/esaviCase.service.ts:40-53,118-126 (toEsaviCaseResponse).
// No `patientId` / `healthFacilityId` at the top level, no `sysDetails`, no `geoLocationId`
// inside `healthFacility`: the service strips all four before the row leaves.
export interface EsaviCaseDetail {
  caseId: string;
  caseCode: string;
  reportDate: string | null;
  eventDate: string | null;
  countryIsoCode: string | null;
  reportFillingDate: string | null;
  notificationOrganization: string | null;
  details: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  patient: {
    patientId: string;
    names: string;
    lastNames: string;
    documentNumber: string;
    healthSystemCode: string | null;
  };
  healthFacility: {
    healthFacilityId: string;
    localCode: string;
    name: string;
  };
}

// GET /api/esavi-cases (ESAVI-CASE-002A) / GET /api/esavi-cases/admin (ESAVI-CASE-002B) — origin:
// esavi-backend/src/services/esaviCase.service.ts, LIST_ATTRIBUTES + toEsaviCaseListRow. Shape
// declared verbatim by SPEC F48 §3.9. NOT a Partial<EsaviCaseDetail>: `healthFacility.geoLocation`
// does not exist on the detail row, and `patient` here has no `documentNumber`.
export interface EsaviCaseListRow {
  caseId: string;
  caseCode: string;
  reportDate: string | null;
  eventDate: string | null;
  isActive: boolean;
  patient: {
    patientId: string;
    names: string;
    lastNames: string;
    healthSystemCode: string | null;
  };
  healthFacility: {
    healthFacilityId: string;
    localCode: string;
    name: string;
    geoLocation: { geoLocationId: string; name: string } | null;
  };
}
