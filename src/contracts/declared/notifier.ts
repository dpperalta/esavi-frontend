// Origin: esavi-backend/src/services/notifier.service.ts
import type { AppDetails } from '@/contracts/common';

// NotifierListRow — LIST_ATTRIBUTES + CASE_INCLUDE + PROFESSION_INCLUDE + GEOLOCATION_INCLUDE +
// toNotifierListRow. The shape of ESAVI-NOTIFIER-002A/002B. `details` is NOT in LIST_ATTRIBUTES:
// the list cannot render it, only the modal has it, and only after a PUT.
export interface NotifierListRow {
  notifierId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  room: string | null;
  address: string | null;
  isActive: boolean;
  case: { caseId: string; caseCode: string; reportDate: string } | null;
  profession: { catalogItemId: string; code: string; name: string } | null;
  geoLocation: { geoLocationId: string; name: string } | null;
}

// NotifierDetail — toNotifierResponse + DETAIL_EXCLUDE. caseId, professionItemId and
// geoLocationId are deleted by the service: a notifier never carries its case id at the first
// level, only inside `case.caseId`.
export interface NotifierDetail {
  notifierId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  room: string | null;
  address: string | null;
  details: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
  case: { caseId: string; caseCode: string; reportDate: string } | null;
  profession: { catalogItemId: string; code: string; name: string } | null;
  geoLocation: { geoLocationId: string; name: string } | null;
}
