// Origin: esavi-backend/src/services/patient.service.ts
import type { AppDetails } from '@/contracts/common';

// PatientListRow — LIST_ATTRIBUTES + SEX_INCLUDE + LIST_RESIDENCE_INCLUDE + toPatientListRow.
// The shape returned by ESAVI-PATIENT-006 and -007. PII arrives decrypted: names, lastNames and
// documentNumber are plain text in the response even though the columns are encrypted.
export interface PatientListRow {
  patientId: string;
  names: string;
  lastNames: string;
  documentNumber: string | null;
  birthDate: string | null;
  healthSystemCode: string | null;
  isActive: boolean;
  sex: { catalogItemId: string; code: string; name: string; value: string | null } | null;
  residence: { geoLocationId: string; name: string } | null;
}

// PatientDetail — toPatientResponse + DETAIL_EXCLUDE + RESIDENCE_INCLUDE. Returned by -001, -003
// and -004. sexItemId, residenceGeoLocationId and nameTokens are deleted by the service and never
// appear here; residence carries geoLevelTypeId and level on top of the list shape.
export interface PatientDetail {
  patientId: string;
  names: string;
  lastNames: string;
  documentNumber: string | null;
  passportNumber: string | null;
  birthDate: string | null;
  healthSystemCode: string | null;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
  sex: { catalogItemId: string; code: string; name: string; value: string | null } | null;
  residence: { geoLocationId: string; name: string; geoLevelTypeId: string; level: number } | null;
}

// PatientNameSearchResponse — the shape of ESAVI-PATIENT-007. It is NOT a PaginatedResponse<T>:
// inactiveCount is computed regardless of role so a USER who cannot see inactive rows does not
// silently duplicate a patient (SPEC F45 §3.3). -006, in contrast, is a plain PaginatedResponse.
export interface PatientNameSearchResponse {
  count: number;
  inactiveCount: number;
  rows: PatientListRow[];
}
