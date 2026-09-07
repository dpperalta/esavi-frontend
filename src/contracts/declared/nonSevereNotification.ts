// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';
import type { NotificationType } from '@/contracts/notification';

// GET .../non-severe-notifications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/nonSevereNotification.service.ts:20-59 (NOTIFICATION_INCLUDE,
// VACCINATION_*_INCLUDE, DETAIL_EXCLUDE, toNonSevereNotificationResponse). No `isActive` of its
// own: the table does not carry that column, and `notification.isActive` is the real source.
// The three vaccination includes never filter by isActive on purpose — a health facility
// deactivated later is still returned, historical.
export interface NonSevereNotificationDetail {
  notificationId: string;
  vaccinationCenterAddress: string | null;
  verifiedPhysicalDocument: boolean | null;
  verifiedElectronicRecord: boolean | null;
  verifiedVerbalReport: boolean | null;
  verifiedClinicalRecord: boolean | null;
  verifiedUnknown: boolean | null;
  verifiedOtherSource: boolean | null;
  otherSourceDescription: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  notification: {
    notificationId: string;
    notificationType: NotificationType;
    esaviDescription: string;
    isActive: boolean;
    case: { caseId: string; caseCode: string; eventDate: string | null };
  };
  vaccinationHealthFacility: { healthFacilityId: string; name: string; localCode: string } | null;
  vaccinationSite: { catalogItemId: string; code: string; name: string } | null;
  vaccinationGeoLocation: { geoLocationId: string; name: string; level: number } | null;
}
