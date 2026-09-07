// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';
import type { NotificationType } from '@/contracts/notification';

// GET .../severe-notifications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/severeNotification.service.ts:15-43 (NOTIFICATION_INCLUDE,
// DETAIL_EXCLUDE, toSevereNotificationResponse). No `isActive` of its own: the table does not
// carry that column, and `notification.isActive` is the real source of the row's status.
export interface SevereNotificationDetail {
  notificationId: string;
  hasPreviousEventHistory: AnswerOption | null;
  hasAllergyToOtherVaccines: AnswerOption | null;
  hasAllergyToMedications: AnswerOption | null;
  hasAllergyToPreviousSameVaccine: AnswerOption | null;
  hasPregnancyComplications: AnswerOption | null;
  pregnancyComplicationsDescription: string | null;
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
}
